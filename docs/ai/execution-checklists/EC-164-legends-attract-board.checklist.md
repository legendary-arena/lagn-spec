# EC-164 — Legends Attract Board (Execution Checklist)

**Source:** docs/ai/work-packets/WP-143-legends-attract-board.md
**Layer:** Client (new app `apps/legends-board`)

## Before Starting
- [ ] WP-142 is Done (snapshot publisher writing to `legends/v1/*`)
- [ ] `legends/v1/manifest.json` is reachable via R2 public-read URL
- [ ] R2 CORS allows `https://legends.legendary-arena.com` origin
- [ ] `pnpm install` exits 0
- [ ] `pnpm -r build` exits 0

## Locked Values (do not re-derive)
- R2 path prefix: `legends/v1/`
- Manifest path: `legends/v1/manifest.json`
- Manifest shape: `{ generatedAt: string (ISO 8601), schemaVersion: 1, boards: string[] }`
- Board file path: `legends/v1/${b}.json` where `b` is each entry in `manifest.boards`
- `manifest.boards` order is authoritative — UI preserves it exactly
- Board names are URL-safe lowercase; client does not sanitize
- Kiosk query param: `?kiosk=1`
- Default cycle interval: 15 seconds (D-14302)
- Stale threshold: 30 minutes (D-14303)
- Manifest poll interval: 60 seconds (D-14306)
- Boards invalidated ONLY when `manifest.generatedAt` changes
- Package name: `@legendary-arena/legends-board`
- App path: `apps/legends-board/`

## Guardrails
- Zero imports from `@legendary-arena/server`, `@legendary-arena/game-engine`, `@legendary-arena/registry`, or `@legendary-arena/preplan`
- Zero requests to `api.legendary-arena.com` or `*.onrender.com`
- Zero persistent storage: no localStorage, sessionStorage, IndexedDB, or cookies
- Board names read dynamically from `manifest.boards` — never hardcoded
- Panel order matches `manifest.boards` array order — no reordering
- SPA renders a visible fallback on fetch failure (not blank page)
- No runtime npm deps beyond `vue` (no UI framework libraries)
- Test files use `.test.ts` extension
- `prefers-reduced-motion` respected in kiosk cycler

## Required `// why:` Comments
- `snapshotClient.ts` fetch timeout: why the timeout value was chosen
- `kioskMode.ts` minimum interval clamp: why 5000ms floor exists
- `FreshnessBadge.vue` stale threshold: why 30 minutes (reference D-14303)

## Files to Produce
- `apps/legends-board/package.json` — **new** — app scaffold
- `apps/legends-board/tsconfig.json` — **new** — strict ESM
- `apps/legends-board/vite.config.ts` — **new** — Vue plugin
- `apps/legends-board/index.html` — **new** — entry with static fallback
- `apps/legends-board/public/_headers` — **new** — CF Pages cache headers
- `apps/legends-board/public/_redirects` — **new** — SPA fallback
- `apps/legends-board/src/main.ts` — **new** — Vue app mount
- `apps/legends-board/src/App.vue` — **new** — root component
- `apps/legends-board/src/snapshots/snapshotClient.ts` — **new** — R2 fetch layer
- `apps/legends-board/src/snapshots/snapshotClient.test.ts` — **new** — unit tests
- `apps/legends-board/src/panels/*.vue` — **new** — one per board
- `apps/legends-board/src/attract/AttractCycler.vue` — **new** — panel cycler
- `apps/legends-board/src/attract/kioskMode.ts` — **new** — query-param parser
- `apps/legends-board/src/attract/kioskMode.test.ts` — **new** — unit tests
- `apps/legends-board/src/freshness/FreshnessBadge.vue` — **new** — staleness UI
- `pnpm-workspace.yaml` — **modified** if not already globbing `apps/*`
- `docs/ai/DECISIONS.md` — **modified** — D-14301..D-14306

## After Completing
- [ ] `pnpm --filter @legendary-arena/legends-board build` exits 0
- [ ] `pnpm --filter @legendary-arena/legends-board test` exits 0
- [ ] Zero `@legendary-arena/` cross-package imports in `apps/legends-board/src/`
- [ ] Zero `api.legendary-arena.com` or `*.onrender.com` URLs in source
- [ ] Cloudflare Pages deploy verified (manual smoke)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-14301..D-14306)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date

## Common Failure Smells (Optional)
- Blank page on load usually means fetch error is swallowed silently — check error-state rendering
- `manifest.boards` hardcoded in a switch/map indicates the dynamic-board-names guardrail was violated
- Import from `../../../packages/` or `@legendary-arena/server` means layer boundary violation
- Polling individual board files on a timer (instead of only on manifest change) violates the refresh model
- `index.html` renders nothing without JS — static fallback requirement not met
