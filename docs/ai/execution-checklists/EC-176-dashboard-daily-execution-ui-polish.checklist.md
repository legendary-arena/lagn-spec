# EC-176 — Dashboard Daily Execution Panel + UI Polish (Execution Checklist)

**Source:** docs/ai/work-packets/WP-162-dashboard-daily-execution-ui-polish.md
**Layer:** Client (`apps/dashboard`)

## Before Starting
- [ ] WP-157 scaffold complete; `pnpm -r build` exits 0
- [ ] PrimeVue 4 Aura theme preset is the sole component library (D-15701)
- [ ] `apps/dashboard/.env` contains `VITE_USE_MOCKS=true`

## Locked Values (do not re-derive)
- Checklist items: 9 total (4 content + 3 community + 2 growth); IDs: `youtube-video`, `youtube-short`, `facebook-post`, `newsletter`, `discord-response-sla`, `discord-unanswered`, `player-acknowledgment`, `tournament-promotion`, `strategy-content`
- Category order: `content` → `community` → `growth` (render order locked)
- localStorage key: `la-dashboard-checklist-{userId}-{dateString}` (`YYYY-MM-DD` local time)
- userId source: `mock-user` under mock auth; real user ID from auth store when auth exists
- Theme key: `la-dashboard-theme`; default: `dark`
- Stale key pruning: enumerate keys matching `la-dashboard-checklist-*` only; delete if date > 30 days old; runs once on composable init; must not affect other localStorage keys
- `toggle(id)` with unknown ID: no mutation, no throw (silent no-op)
- Date boundary: browser local midnight (00:00); resets on first load after local date change. `dateString` built from local year/month/day components — must NOT use `toISOString()` (UTC-based)
- Design tokens: `--p-surface-card`, `--p-surface-border`, `--p-text-color`, `--p-text-muted-color`, `--p-primary-color`
- Sidebar breakpoints: full at >= 1200px; collapsed (60px, icons) at 768-1199px; hidden at < 768px
- Completion badge: `"Daily: N/M complete"` in panel header, right-aligned
- Decisions: D-16201 through D-16203

## Guardrails
- Zero imports from `@legendary-arena/(game-engine|registry|preplan|server)` or `boardgame.io`
- Every widget (including DailyExecutionPanel): 4-state (loading/error/empty/data) + freshness badge
- Checklist config is a single static `readonly` array in `useDailyChecklist.ts` — never fetched, transformed, sorted, or re-derived at runtime; UI renders directly from it
- Checklist persistence: explicit writes in `toggle()` and `resetAll()` only — no deep watchers
- Composable init order: (1) define static array, (2) resolve userId, (3) compute dateString, (4) load persisted state, (5) apply to items, (6) prune stale keys
- Theme preference read from localStorage before Vue app mount (synchronous); prevents flash
- Theme switching via PrimeVue preset swapping only — no manual CSS class toggles or custom CSS variables duplicating PrimeVue tokens
- Hard-coded hex colors forbidden for structural elements — PrimeVue tokens only
- Status colors always paired with text label or icon (color never sole indicator)
- Sidebar state via reactive `isCollapsed`/`isHidden` in AppLayout — no `body` media queries; resize handler must be throttled
- No pie charts
- No new npm dependencies (unless PrimeVue theme toggle requires sub-import — document in decisions)

## Required `// why:` Comments
- None mandated (no engine state, no `ctx.events.*`, no `ctx.random.*`)

## Files to Produce
**New (3):**
- `src/widgets/DailyExecutionPanel.vue` — 4-state widget (loading/error/empty/data) + freshness badge; renders category headers ("Content", "Community", "Growth")
- `src/composables/useDailyChecklist.ts` — composable: items, toggle, reset, localStorage persistence
- `src/composables/useDailyChecklist.test.ts` — 7 tests: (1) 9 items with correct category distribution, (2) toggle flips completed + sets/clears completedAt, (3) completedCount accurate after multiple toggles, (4) state survives localStorage round-trip, (5) new date → fresh unchecked list, (6) prunes keys > 30 days, (7) toggle("invalid") → no mutation

**Modified (~8):**
- `src/main.ts` — configure Aura light/dark presets; apply initial theme from localStorage before mount
- `src/layouts/AppLayout.vue` — responsive sidebar, theme toggle, role badge
- `src/pages/dashboard/OverviewPage.vue` — add DailyExecutionPanel below KPI row, above charts
- `src/widgets/KpiCard.vue` — header/body/footer card structure + design tokens
- `src/widgets/AlertsPanel.vue` — severity colors + text labels
- `src/widgets/DauChartWidget.vue` — chart styling with theme tokens
- `src/widgets/RevenueChartWidget.vue` — chart styling with theme tokens
- `src/pages/players/PlayerAnalyticsPage.vue` — striped rows, sticky header

**Governance (3):** `DECISIONS.md` (D-16201–D-16203), `WORK_INDEX.md`, `EC_INDEX.md`

## After Completing
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard test` — 7 checklist tests pass
- [ ] Overview renders: 4 KPIs + 2 charts + alerts + Daily Execution Panel (9 items, 3 categories)
- [ ] Checklist: toggle persists across navigation; survives browser refresh; resets on new day
- [ ] Badge: `"Daily: N/M complete"` updates reactively on toggle
- [ ] Theme: dark default; toggle switches light↔dark; preference survives reload; no flash on load
- [ ] Sidebar: full at 1200+; collapsed icons at 768-1199; hidden + hamburger at < 768
- [ ] All widget cards: header/body/footer structure; PrimeVue surface tokens; no custom hex
- [ ] Alerts: severity text label on every alert (not color-only)
- [ ] DataTable (Players): striped rows, sticky header, visible filter row
- [ ] Zero grep: `@legendary-arena/(game-engine|registry|preplan|server)`, `boardgame.io`, `packages/`
- [ ] Governance: DECISIONS (D-16201–D-16203), WORK_INDEX (WP-162 row), EC_INDEX updated

## Common Failure Smells
- Checklist does not reset on new day → date boundary logic not comparing local date strings
- Theme flashes light→dark on load → localStorage read occurs after first mount instead of before
- Sidebar flickers on resize → resize handler not throttled
- Checklist state lost between sessions → userId in storage key is undefined or random
- Stale keys accumulating → pruning logic not running on composable init
- DailyExecutionPanel shows no freshness badge → not consuming ServiceResponse envelope
