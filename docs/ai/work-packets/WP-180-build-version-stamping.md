# WP-180 — Build-Time Version Stamping

## Goal

Every deployed app displays a subtle version badge so an operator can instantly
tell whether a live deployment matches the latest build on `main` — solving the
"worktree updated but Cloudflare still serving stale code" class of problems.
After this session, every Vite SPA shows a fixed-position footer badge like
`v0.1.0 · abc1234 · May 25, 2026` and the server exposes a
`GET /api/version` endpoint returning the same triple.

## Assumes

- All four Vite apps build and typecheck cleanly (`pnpm -r build` exits 0)
- `apps/arena-client` and `apps/registry-viewer` use `AppShell.vue` →
  `BrandFooter` (Footer.vue) for layout chrome
- `apps/dashboard` already injects `__BUILD_TIMESTAMP__` via `vite.config.ts`
  `define` and displays it on DebugPage
- `apps/legends-board` has no AppShell or BrandFooter — version badge mounts
  directly in `App.vue`
- `apps/server/src/index.mjs` is the process entrypoint; routes are registered
  in `server.mjs`
- Git is available at build time (CI and local dev both have `git` on PATH);
  if unavailable, the build must not fail (fallback to `'unknown'`)

## Context (Read First)

- `apps/dashboard/vite.config.ts` — existing `__BUILD_TIMESTAMP__` pattern
- `apps/dashboard/src/env.d.ts` — existing global type declaration
- `apps/dashboard/src/pages/debug/DebugPage.vue` — existing version display
- `apps/arena-client/src/components/branding/Footer.vue` — arena-client footer
- `apps/registry-viewer/src/components/branding/Footer.vue` — registry-viewer footer
- `apps/legends-board/src/App.vue` — legends-board root (no AppShell)
- `docs/ai/REFERENCE/00.6-code-style.md` — code-style rules

## Scope (In)

- Add three build-time constants to every Vite app's `vite.config.ts`:
  - `__APP_VERSION__` — from `package.json` `version` field
  - `__BUILD_TIMESTAMP__` — `new Date().toISOString()` (dashboard already has this)
  - `__GIT_SHA__` — `git rev-parse --short HEAD` (7-char short SHA), with
    try/catch fallback to `'unknown'` if git is unavailable
- Add global type declarations for the three constants in each app's `env.d.ts`
  (create the file where it does not exist)
- Add a `<VersionBadge>` component to each Vite app that displays the version
  triple in a fixed-position bottom-right badge. All four copies must be
  **byte-identical** in template + style (the only variance is the import path).
  See §Locked Contract Values for the exact visual specification.
- Mount the badge in each app's root layout:
  - `arena-client`: inside `Footer.vue` (BrandFooter)
  - `registry-viewer`: inside `Footer.vue` (BrandFooter)
  - `dashboard`: inside `App.vue` (no AppShell in dashboard)
  - `legends-board`: inside `App.vue` (no AppShell)
- Add a `GET /api/version` endpoint to `apps/server` returning
  `{ version, gitSha, buildTimestamp }` — server resolves version info at
  process start: `version` from `package.json`, `gitSha` via
  `execSync('git rev-parse --short HEAD')` with fallback to `'unknown'`,
  `buildTimestamp` = process start time (ISO string). Values are cached in
  memory and returned for all requests (no per-request recompute).
- Dashboard's DebugPage continues to work (it already reads
  `__BUILD_TIMESTAMP__` and `package.json` version)

### Timestamp Semantics (Intentional Difference)

- **Client `__BUILD_TIMESTAMP__`** = Vite build time. Immutable per deploy.
  Changes only when the app is rebuilt and redeployed.
- **Server `buildTimestamp`** = process start time. Changes on every restart
  (including Render auto-deploys, manual restarts, and dyno cycling).

These values are expected to differ. The client timestamp answers "when was
this bundle built?" and the server timestamp answers "when did this process
start?" Both are useful for deployment freshness diagnosis.

## Out of Scope

- Semantic version tagging workflow (no `v*.*.*` git tags in this WP)
- Bumping any `package.json` version number (keep existing values)
- CI workflow changes (the `define` approach works without CI changes)
- Automated version bumping or release scripting
- Version display in `wiki-viewer` (Hugo static site — different build system)
- Version display in `replay-producer` (CLI tool, not a deployed UI)
- Changelog generation
- Any game engine, registry, or preplan package changes
- Creating a `packages/ui` shared component package (deferred until a second
  shared UI component justifies the package overhead; per code-style rule
  "duplicate first, abstract only when a third copy appears")
- Hover tooltip showing full SHA / full ISO timestamp (future enhancement)

## Files Expected to Change

### arena-client
- `apps/arena-client/vite.config.ts` — modified — add `define` block with
  `execSync` import and three constants
- `apps/arena-client/src/env.d.ts` — new — declare `__APP_VERSION__`,
  `__BUILD_TIMESTAMP__`, `__GIT_SHA__`
- `apps/arena-client/src/components/branding/VersionBadge.vue` — new —
  version badge component (byte-identical template+style to other apps)
- `apps/arena-client/src/components/branding/Footer.vue` — modified —
  import and mount `<VersionBadge />`

### registry-viewer
- `apps/registry-viewer/vite.config.ts` — modified — add `define` block
- `apps/registry-viewer/src/env.d.ts` — new — declare constants
- `apps/registry-viewer/src/components/branding/VersionBadge.vue` — new —
  version badge component (byte-identical template+style)
- `apps/registry-viewer/src/components/branding/Footer.vue` — modified —
  import and mount `<VersionBadge />`

### dashboard
- `apps/dashboard/vite.config.ts` — modified — add `__APP_VERSION__`,
  `__GIT_SHA__` (already has `__BUILD_TIMESTAMP__`); add `execSync` import
- `apps/dashboard/src/env.d.ts` — modified — add `__APP_VERSION__`,
  `__GIT_SHA__` declarations
- `apps/dashboard/src/components/VersionBadge.vue` — new — version badge
  component (byte-identical template+style)
- `apps/dashboard/src/App.vue` — modified — import and mount `<VersionBadge />`

### legends-board
- `apps/legends-board/vite.config.ts` — modified — add `define` block
- `apps/legends-board/src/env.d.ts` — new — declare constants
- `apps/legends-board/src/components/VersionBadge.vue` — new — version badge
  component (byte-identical template+style)
- `apps/legends-board/src/App.vue` — modified — import and mount `<VersionBadge />`

### server
- `apps/server/src/version.mjs` — new — exports `getVersionInfo()` resolving
  version + gitSha + buildTimestamp at first call, cached for process lifetime
- `apps/server/src/server.mjs` — modified — import `getVersionInfo`, register
  `GET /api/version` route

### governance
- `docs/ai/work-packets/WORK_INDEX.md` — modified — mark WP-180 complete
- `docs/ai/STATUS.md` — modified — session entry
- `docs/ai/DECISIONS.md` — modified — D-18001 (timestamp semantics), D-18002
  (per-app component over shared package)
- `docs/ai/REFERENCE/api-endpoints.md` — modified — add `GET /api/version` row

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- Full file contents for every new or modified file — no diffs, no snippets
- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- No game engine, registry, or preplan imports in any changed file
- No gameplay logic in any changed file
- `__GIT_SHA__` must use `execSync('git rev-parse --short HEAD')` in the
  Vite config (build-time only — this is a Node script, not browser code)
- If `git rev-parse --short HEAD` fails (shallow clone, ZIP deploy, no `.git`
  directory), fall back to `'unknown'` and log a build-time warning to stderr.
  Do not fail the build.
- The `VersionBadge` component must be purely presentational — no fetch, no
  store, no side effects
- All three constants (`__APP_VERSION__`, `__BUILD_TIMESTAMP__`, `__GIT_SHA__`)
  must be directly referenced in the `VersionBadge` template to ensure they
  are retained in the production bundle (prevent tree-shaking elimination)
- All four `VersionBadge.vue` copies must use identical template + style
  markup (no per-app customization). The only permitted difference is the
  import path in the parent mount file.
- The server `/api/version` endpoint is read-only, unauthenticated (`guest`)
- Stop and ask if anything is unclear

**Session protocol:**
- Stop and ask on any ambiguity before writing code

**Locked contract values:**

Constants:
- `__APP_VERSION__` — sourced from the app's own `package.json` `version` field
- `__BUILD_TIMESTAMP__` — `new Date().toISOString()` at build time
- `__GIT_SHA__` — `execSync('git rev-parse --short HEAD').toString().trim()`
  wrapped in try/catch, fallback `'unknown'`

Badge format string:
- `v${__APP_VERSION__} · ${__GIT_SHA__} · ${formattedDate}`
- `formattedDate` = short locale date from `__BUILD_TIMESTAMP__` (e.g.,
  `May 25, 2026`)
- Separator is ` · ` (space-middot-space, `·`)

Badge visual specification:
- `position: fixed`
- `bottom: 4px; right: 8px`
- `font-size: 11px`
- `font-family: monospace`
- `opacity: 0.5`
- `color: #aaa` (or CSS variable equivalent if available)
- `background: transparent` (no background box — text only)
- `pointer-events: none`
- `z-index: 50` (above content, below modals)
- `user-select: none`
- No padding, no border-radius, no background color

Server endpoint response shape:
- `{ version: string, gitSha: string, buildTimestamp: string }`
- `buildTimestamp` is ISO 8601 string

## Acceptance Criteria

- [ ] `pnpm -r build` exits 0 (all apps build cleanly)
- [ ] All four Vite apps' `dist/` output contains the current git SHA as a
  baked string literal (not a runtime global name)
- [ ] `__APP_VERSION__` does not appear as a literal string in any `dist/`
  JS file (confirms Vite `define` replaced it at build time)
- [ ] Each Vite app renders a `VersionBadge` in the fixed bottom-right position
- [ ] All four `VersionBadge.vue` files have identical `<template>` and
  `<style>` blocks
- [ ] `apps/server` responds to `GET /api/version` with
  `{ version, gitSha, buildTimestamp }` (JSON, 200)
- [ ] No `@legendary-arena/game-engine`, `@legendary-arena/registry`, or
  `@legendary-arena/preplan` imports were added to any changed file
- [ ] Dashboard's DebugPage still displays build timestamp and app version
- [ ] Building without git available (e.g., in a directory without `.git`)
  does not crash — `__GIT_SHA__` resolves to `'unknown'`

## Verification Steps

```pwsh
# 1. All apps build
pnpm -r build
# Expected: exits 0

# 2. Verify constants are baked (fully replaced at build time, not runtime globals)
Select-String -Path apps/arena-client/dist/assets/*.js -Pattern '__APP_VERSION__'
# Expected: NO matches (constant was replaced by its value)
Select-String -Path apps/registry-viewer/dist/assets/*.js -Pattern '__APP_VERSION__'
# Expected: NO matches

# 3. Verify git SHA appears in built output
$sha = (git rev-parse --short HEAD).Trim()
Select-String -Path apps/arena-client/dist/assets/*.js -Pattern $sha | Select-Object -First 1
# Expected: match found

# 4. Typecheck all apps that have typecheck scripts
pnpm --filter @legendary-arena/arena-client typecheck
pnpm --filter registry-viewer typecheck
pnpm --filter @legendary-arena/dashboard typecheck
# Expected: all exit 0

# 5. VersionBadge template+style identity check
# (Compare the four files — template and style blocks must be identical)

# 6. Verify server endpoint
# (Manual: start server locally, curl http://localhost:8000/api/version)
# Expected: JSON with { version, gitSha, buildTimestamp }

# 7. Layer boundary
Select-String -Path apps/*/src/components/**/VersionBadge.vue,apps/*/src/components/VersionBadge.vue -Pattern 'game-engine|registry|preplan'
# Expected: NO matches
```

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-18001 (timestamp semantics),
  D-18002 (per-app VersionBadge over shared package)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has this packet checked off
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated with `GET /api/version` row
  (replace-whole-row semantics per D-11804)
- [ ] No files outside the "Files Expected to Change" list were modified

## Amendments

*(None yet — amendments are recorded here during execution.)*

## Portability Notes

This pattern is reusable across any Vite + Vue project:

1. **Vite config** — add `define` block with three constants (copy the
   `execSync` + `JSON.stringify` + try/catch pattern from any app's
   `vite.config.ts`)
2. **env.d.ts** — declare the three `const` globals
3. **VersionBadge.vue** — copy the component (it has zero external dependencies)
4. **Mount** — import and place `<VersionBadge />` in your root layout

For non-Vite apps (Express, Koa, etc.), the server pattern applies: read
`package.json` at startup, capture git SHA via `execSync`, cache in memory,
expose via endpoint or response header.
