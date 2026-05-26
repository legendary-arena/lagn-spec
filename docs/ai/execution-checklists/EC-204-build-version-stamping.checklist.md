# EC-204 — Build-Time Version Stamping (Execution Checklist)

**Source:** docs/ai/work-packets/WP-180-build-version-stamping.md
**Layer:** Cross-app (`apps/*/vite.config.ts`, `apps/server/src/`)

## Before Starting

- [ ] `pnpm -r build` exits 0 (all apps build cleanly before changes)
- [ ] `apps/dashboard/vite.config.ts` has existing `__BUILD_TIMESTAMP__` define
- [ ] `apps/arena-client/src/components/branding/Footer.vue` exists
- [ ] `apps/registry-viewer/src/components/branding/Footer.vue` exists
- [ ] `git rev-parse --short HEAD` returns a 7-char SHA in the repo root

## Locked Values (do not re-derive)

Constants (Vite `define` block):
- `__APP_VERSION__`: `JSON.stringify(version)` where `version` is imported
  from the app's own `package.json`
- `__BUILD_TIMESTAMP__`: `JSON.stringify(new Date().toISOString())`
- `__GIT_SHA__`: `JSON.stringify(gitSha)` where `gitSha` is resolved via
  try/catch around `execSync('git rev-parse --short HEAD').toString().trim()`,
  fallback `'unknown'`

Badge format string: `v${__APP_VERSION__} · ${__GIT_SHA__} · ${formattedDate}`
- `formattedDate` derived from `new Date(__BUILD_TIMESTAMP__)` as short locale
  date (e.g., `May 25, 2026`)
- Separator: ` · ` (space-middot-space)

Badge CSS (exact values, all four apps):
- `position: fixed; bottom: 4px; right: 8px`
- `font-size: 11px; font-family: monospace`
- `opacity: 0.5; color: #aaa; background: transparent`
- `pointer-events: none; user-select: none; z-index: 50`

Server endpoint: `GET /api/version`
- Response: `{ version: string, gitSha: string, buildTimestamp: string }`
- `buildTimestamp` = process start time (ISO 8601), NOT build time (D-18001)
- Values cached at process start, no per-request recompute

## Guardrails

- Zero `@legendary-arena/game-engine` imports in any changed file
- Zero `@legendary-arena/registry` imports in any changed file
- Zero `@legendary-arena/preplan` imports in any changed file
- All four `VersionBadge.vue` files: `<template>` and `<style>` blocks are
  byte-identical (only `<script>` import path may differ)
- Git SHA fallback: if `execSync` throws, resolve to `'unknown'` and log
  a warning — do NOT fail the build
- All three constants must be directly referenced in the `VersionBadge`
  template (prevents tree-shaking elimination)
- `__APP_VERSION__` must NOT appear as a literal string in any `dist/` JS
  file after build (confirms Vite `define` replacement)
- Dashboard DebugPage must still work (it reads `__BUILD_TIMESTAMP__` and
  `package.json` version independently)

## Required `// why:` Comments

- `vite.config.ts` (each app): on the `execSync` try/catch — explain that
  git may be unavailable in CI shallow clones or ZIP deploys
- `vite.config.ts` (each app): on the `define` block — explain that these
  are build-time constants replaced by Vite, not runtime globals
- `version.mjs` (server): on the process-start timestamp — explain that
  server uses boot time, not build time (D-18001)
- `server.mjs`: on the `/api/version` route — explain that this is read-only
  diagnostics for deployment freshness verification

## Files to Produce

### arena-client
- `apps/arena-client/vite.config.ts` — **modified** — add `execSync` import,
  git SHA resolution, `define` block with three constants
- `apps/arena-client/src/env.d.ts` — **new** — three `declare const` lines
- `apps/arena-client/src/components/branding/VersionBadge.vue` — **new** —
  presentational badge component
- `apps/arena-client/src/components/branding/Footer.vue` — **modified** —
  import + mount `<VersionBadge />`

### registry-viewer
- `apps/registry-viewer/vite.config.ts` — **modified** — add `define` block
- `apps/registry-viewer/src/env.d.ts` — **new** — three `declare const` lines
- `apps/registry-viewer/src/components/branding/VersionBadge.vue` — **new** —
  badge component (byte-identical template+style)
- `apps/registry-viewer/src/components/branding/Footer.vue` — **modified** —
  import + mount `<VersionBadge />`

### dashboard
- `apps/dashboard/vite.config.ts` — **modified** — add `__APP_VERSION__`,
  `__GIT_SHA__` to existing `define` block; add `execSync` import
- `apps/dashboard/src/env.d.ts` — **modified** — add two `declare const` lines
- `apps/dashboard/src/components/VersionBadge.vue` — **new** — badge component
  (byte-identical template+style)
- `apps/dashboard/src/App.vue` — **modified** — import + mount `<VersionBadge />`

### legends-board
- `apps/legends-board/vite.config.ts` — **modified** — add `define` block
- `apps/legends-board/src/env.d.ts` — **new** — three `declare const` lines
- `apps/legends-board/src/components/VersionBadge.vue` — **new** — badge
  component (byte-identical template+style)
- `apps/legends-board/src/App.vue` — **modified** — import + mount
  `<VersionBadge />`

### server
- `apps/server/src/version.mjs` — **new** — `getVersionInfo()` (cached)
- `apps/server/src/server.mjs` — **modified** — import + register
  `GET /api/version` route

### governance
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — one new row
- `docs/ai/DECISIONS.md` — **modified** — D-18001, D-18002
- `docs/ai/STATUS.md` — **modified** — session entry
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — mark complete

## After Completing

- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0
- [ ] `pnpm --filter registry-viewer typecheck` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0
- [ ] `Select-String -Path apps/arena-client/dist/assets/*.js -Pattern '__APP_VERSION__'` returns NO matches
- [ ] `Select-String -Path apps/registry-viewer/dist/assets/*.js -Pattern '__APP_VERSION__'` returns NO matches
- [ ] Four `VersionBadge.vue` template+style blocks are byte-identical
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-18001 timestamp semantics, D-18002
  per-app component rationale)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/REFERENCE/api-endpoints.md` has `GET /api/version` row

## Common Failure Smells

- **`__APP_VERSION__` found in `dist/` JS** → Vite `define` not configured
  correctly; the constant name was quoted as a string instead of being
  replaced by its value at build time
- **Build crashes with "git: command not found"** → missing try/catch
  fallback around `execSync`; the `'unknown'` fallback path is not wired
- **Badge invisible on production** → `z-index` too low (below page content)
  or `opacity` set to 0 instead of 0.5
- **Dashboard DebugPage shows `undefined` for version** → `__APP_VERSION__`
  define was added but the existing `import { version } from '../../../package.json'`
  in DebugPage was broken; both paths must work independently
- **`dist/` JS contains the string `unknown` when git IS available** →
  `execSync` fallback path is always taken; check that `node:child_process`
  import is present and the command runs in the repo root
