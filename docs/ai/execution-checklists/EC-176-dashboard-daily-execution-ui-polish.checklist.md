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
- localStorage key: `la-dashboard-checklist-{userId}-{dateString}` (`YYYY-MM-DD` local time); userId = `mock-user` under mock auth, else real user ID from auth store (never a random UUID)
- Theme key: `la-dashboard-theme`; default: `dark`
- Stale key pruning: consider only keys where `key.startsWith('la-dashboard-checklist-')` (exact prefix); delete if date > 30 days old; runs once on composable init; non-matching keys (incl. `la-dashboard-theme`) are never parsed or deleted
- `toggle(id)` with unknown ID: no mutation, no throw (silent no-op)
- Date: boundary = browser local midnight (resets first load after local date change); `dateString` from local `getFullYear`/`getMonth`+1/`getDate`, zero-padded `YYYY-MM-DD` — never `toISOString()`/`toLocaleDateString()`. Composable takes optional `{ now?: () => Date }` resolved as `options?.now ?? (() => new Date())` (`exactOptionalPropertyTypes: true` — never typed `|undefined`, never passed explicit `undefined`); ALL date reads go through `now()` — tests inject `now`, never mock global `Date`
- State restoration: merge persisted value ONTO static config — iterate static array only; missing id → unchecked; persisted ids not in static config → ignored; a persisted entry is applied only if shape-valid (`completed`:boolean, `completedAt`:number\|null) — malformed/wrong-typed → unchecked, never coerced (distinct from `JSON.parse` throw → error state); rendered count always === static array length
- Design tokens: `--p-surface-card`, `--p-surface-border`, `--p-text-color`, `--p-text-muted-color`, `--p-primary-color`; hard-coded hex forbidden for structural elements (tokens only)
- Sidebar breakpoints: full at >= 1200px; collapsed (60px, icons) at 768-1199px; hidden at < 768px
- Completion badge: `"Daily: N/M complete"` in panel header, right-aligned
- Decisions: D-16201 through D-16203

## Guardrails
- Zero imports from `@legendary-arena/(game-engine|registry|preplan|server)` or `boardgame.io`
- Every widget (incl. DailyExecutionPanel): 4 states + freshness badge — loading (pre-resolve), error (localStorage read/parse failure → fallback sentence, never throws), empty (static array length 0), data (9 items)
- Checklist config = single static `readonly` array in `useDailyChecklist.ts` — never fetched, transformed, sorted, or re-derived; UI renders directly from it. Persistence = explicit writes in `toggle()`/`resetAll()` only — no deep watchers
- Composable init order: (1) define static array, (2) resolve userId, (3) compute dateString, (4) load persisted state, (5) apply to items, (6) prune stale keys
- Theme: resolved synchronously in `main.ts` BEFORE `createApp(...).mount(...)` (not in `onMounted`; prevents flash); switched via PrimeVue preset swapping only — no manual CSS class toggles or custom vars duplicating PrimeVue tokens
- Accessibility: color never sole status indicator — each alert has a severity text label + PrimeVue severity icon; each checklist item has a real checkbox + visible label, keyboard-operable (tab + space/enter), completed items may be muted but stay visible. `resetAll()` is destructive — the panel's click handler MUST `confirm()` first (composable does not prompt)
- Sidebar state via reactive `isCollapsed`/`isHidden` in AppLayout — no `body` media queries; resize handler throttled 100–200ms; reassign state ONLY when a 768/1200 boundary is crossed (not every tick); remove listener in `onUnmounted`
- No pie charts; no new npm dependencies (unless PrimeVue theme toggle requires a sub-import — document in decisions)

## Required `// why:` Comments
- None mandated (no engine state, no `ctx.events.*`, no `ctx.random.*`)

## Files to Produce
**New (3):**
- `src/widgets/DailyExecutionPanel.vue` — 4-state widget (loading/error/empty/data) + freshness badge; renders category headers ("Content", "Community", "Growth")
- `src/composables/useDailyChecklist.ts` — composable: items, toggle, reset, localStorage persistence
- `src/composables/useDailyChecklist.test.ts` — 9 tests: (1) 9 items with correct category distribution, (2) toggle flips completed + sets/clears completedAt, (3) completedCount accurate after multiple toggles, (4) state survives localStorage round-trip, (5) new date (injected `now`) → fresh unchecked list, (6) prunes keys > 30 days (injected `now`), (7) toggle("invalid") → no mutation, (8) persisted id absent from static config ignored on restore + missing static item → unchecked, (9) shape-invalid persisted entry (non-boolean `completed` / non-object) → unchecked, no throw

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
- [ ] `pnpm -r build` and `pnpm --filter @legendary-arena/dashboard build` both exit 0
- [ ] `pnpm --filter @legendary-arena/dashboard test` — 9 checklist tests pass
- [ ] Overview renders: 4 KPIs + 2 charts + alerts + Daily Execution Panel (9 items, 3 categories)
- [ ] Checklist: toggle persists across navigation; survives browser refresh; resets on new day
- [ ] Badge: `"Daily: N/M complete"` updates reactively on toggle
- [ ] Theme: dark default; toggle switches light↔dark; preference survives reload; no flash on load
- [ ] Sidebar: full at 1200+; collapsed icons at 768-1199; hidden + hamburger at < 768
- [ ] All widget cards: header/body/footer structure; PrimeVue surface tokens; no custom hex
- [ ] Checklist items: checkbox + visible label, keyboard-operable; completed items muted but visible; reset prompts a confirm
- [ ] Alerts: severity text label + icon on every alert (not color-only); panel error state renders fallback on forced localStorage parse failure (no crash)
- [ ] DataTable (Players): striped rows, sticky header, visible filter row
- [ ] Zero grep: `@legendary-arena/(game-engine|registry|preplan|server)`, `boardgame.io`, `packages/`
- [ ] Governance: DECISIONS (D-16201–D-16203), WORK_INDEX (WP-162 row), EC_INDEX updated

## Common Failure Smells
- Checklist does not reset on new day → date boundary logic not comparing local date strings
- Theme flashes light→dark on load → localStorage read occurs after first mount instead of before
- Sidebar flickers on resize → resize handler not throttled
- Checklist state lost between sessions → userId in storage key is undefined or random
- Stale keys accumulating → pruning logic not running on composable init
