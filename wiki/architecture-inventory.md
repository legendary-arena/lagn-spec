---
title: Architecture & Library Adoption Inventory
type: Generated
status: evergreen
tags:
  - generated
  - architecture
  - inventory
---

# Architecture & Library Adoption Inventory

_Generated 2026-05-18 by `scripts/architecture-inventory.mjs`._

This is a deterministic snapshot of installed dependencies,
their actual import usage across the workspace, and SaaS /
embedded service integrations detected via static analysis.
It does **not** make recommendations — feed it into the
gap-analysis prompt alongside `docs/02-ARCHITECTURE.md` and
`docs/ai/ARCHITECTURE.md` for prioritized advice.

## Application stacks

One entry per app under `apps/*`. Each "Stack" line is
synthesised from the app's own manifests:

- Node apps (`apps/*/package.json` present): `dependencies` /
  `devDependencies` versions, plus a few transitive facts
  confirmed against `pnpm-lock.yaml` (Socket.IO and Koa
  router both ship via `boardgame.io`, not as direct deps).
  Descriptions come from each workspace's `package.json#description`.
- Hugo apps (`apps/*/hugo.toml` present, no `package.json`):
  pinned binary version from `apps/<name>/.hugo-version`,
  source page count from the projection input directory, and
  deploy target verified against `render.yaml`.

- **`apps/arena-client`** — Gameplay client SPA for Legendary Arena (Vue 3 + Vite + Pinia, TypeScript)
  - Stack: Vue 3 SFCs (`vue@^3.4.27`) + Pinia stores (`pinia@^2.1.7`) + Vite bundler (`vite@^5.3.1`) + boardgame.io (`boardgame.io@^0.50.0`) over Socket.IO (transitive via `boardgame.io`).
- **`apps/dashboard`** — Internal admin dashboard SPA for Legendary Arena (Vue 3 + PrimeVue 4 + Vite)
  - Stack: Vue 3 SFCs (`vue@^3.4.27`) + Pinia stores (`pinia@^2.1.7`) + vue-router (`vue-router@^4.3.2`) + Vite bundler (`vite@^5.3.1`) + PrimeVue (`primevue@^4.0.0`) + Axios (`axios@^1.7.2`) + ECharts (`echarts@^5.5.0`).
- **`apps/legends-board`** — Public Legends Attract Board — read-only scoreboard SPA for legends.legendary-arena.com
  - Stack: Vue 3 SFCs (`vue@^3.4.27`) + Vite bundler (`vite@^5.3.1`).
- **`apps/registry-viewer`** — Client-only Registry Viewer for Legendary Arena (Vite + Vue 3)
  - Stack: Vue 3 SFCs (`vue@^3.4.27`) + Vite bundler (`vite@^5.3.1`).
- **`apps/replay-producer`** — CLI Producer App (D-6301) that wraps buildSnapshotSequence with file I/O to emit deterministic ReplaySnapshotSequence JSON
  - Stack: _(no recognised framework deps — likely a CLI or pure Node app)_.
- **`apps/server`** — Legendary Arena boardgame.io game server — wiring layer only
  - Stack: boardgame.io (`boardgame.io@^0.50.0`) over Socket.IO (transitive via `boardgame.io`) + HTTP routes via Koa router (`@koa/router@10.1.1` + `koa@2.16.4`, both transitive via `boardgame.io`) + PostgreSQL via `pg@^8.13.0`.
- **`apps/wiki-viewer`** — Engineering wiki build pipeline. Build-time, read-only Hugo projection of `wiki/` (no `package.json` — Hugo is a Go binary, not a Node dep). Layer-boundary clean: zero runtime imports of `@legendary-arena/game-engine`, `@legendary-arena/registry`, or `apps/server`. Build pipeline is `pnpm wiki-viewer:project` (copy `wiki/*.md` → `apps/wiki-viewer/content/`) → `pnpm wiki-viewer:check-links` (case-sensitive internal-link gate) → `hugo --minify`.
  - Stack: Hugo Extended (`hugo@0.135.0`, pinned in `apps/wiki-viewer/.hugo-version`) + 25 source pages projected from `wiki/` + deployed as Render Static Site `legendary-arena-wiki`.

## Deployment topology

Canonical source: `docs/ops/domains.json`. Ops runbook: `docs/ops/DOMAINS.md`.

| Subdomain | App / Source | Host | State |
|---|---|---|---|
| `legendary-arena.com` | redirect rule -> www.legendary-arena.com | Cloudflare Pages (redirect rule) | live |
| `www.legendary-arena.com` | External Hugo repo at C:\www\legendary-arena-com | Cloudflare Pages | live |
| `play.legendary-arena.com` | apps/arena-client | Cloudflare Pages | live |
| `cards.legendary-arena.com` | apps/registry-viewer | Cloudflare Pages | planned |
| `wiki.legendary-arena.com` | TBD - separate Hugo site (not yet authored) | Cloudflare Pages | planned |
| `ewiki.legendary-arena.com` | apps/wiki-viewer (Hugo build of docs/wiki/) | Render Static Site + Cloudflare Access | live |
| `legends.legendary-arena.com` | apps/legends-board (planned — see WP-143) | Cloudflare Pages | planned |
| `api.legendary-arena.com` | apps/server | Render (legendary-arena-server) | live |
| `legendary-arena-server.onrender.com` | apps/server | Render | live |
| `images.barefootbetters.com` | external (BarefootBetters image bucket) | Cloudflare R2 + Cloudflare CDN | live |

## Infrastructure services

Managed services the project depends on, derived from
`render.yaml` and `docs/ops/domains.json`. Answers "what
vendor accounts and managed services does this project
depend on?" — distinct from Deployment topology, which
answers "what URL maps to what app."

### Cloudflare

| Service | Kind | URL / Scope |
|---|---|---|
| Cloudflare Access (zero-trust gate) | zero-trust gate | `ewiki.legendary-arena.com` |
| Cloudflare Pages (static hosting) | static hosting | `cards.legendary-arena.com`, `legendary-arena.com`, `legends.legendary-arena.com`, `play.legendary-arena.com`, `wiki.legendary-arena.com`, `www.legendary-arena.com` |
| Cloudflare R2 (object storage + CDN) | object storage + CDN | `images.barefootbetters.com` |

### Render

| Service | Kind | URL / Scope |
|---|---|---|
| `legendary-arena-db` | Managed PostgreSQL (basic-256mb) | _internal (connection string via env)_ |
| `legendary-arena-server` | Render Web Service | https://legendary-arena-server.onrender.com |
| `legendary-arena-wiki` | Render Web Service | https://legendary-arena-wiki.onrender.com |

## First-party subsystems

Internally-built modules of architectural significance that
don't surface in the library tables or per-app stacks.
Each entry's contract surface is verified against actual
`export` declarations on disk, so a renamed or removed
symbol shows up here as drift instead of a stale doc lie.

### PAR Simulation Engine

- **Location:** `packages/game-engine/src/simulation`
- **Owning work packet:** [WP-049](docs/ai/work-packets/WP-049-par-simulation-engine.md)

AI-policy-driven calibration pipeline. T0 RandomPolicy and T2 CompetentHeuristicPolicy sample raw scores via runSimulation; aggregateParFromSimulation reduces the distribution to a percentile PAR (Player Approachability Rating) value, which is persisted as a versioned artifact. Calibration tooling, not gameplay logic (D-0701).

**Contract surface (verified against on-disk exports):**

| Symbol | Status |
|---|---|
| `runSimulation` | present |
| `getLegalMoves` | present |
| `createRandomPolicy` | present |
| `createCompetentHeuristicPolicy` | present |
| `AI_POLICY_TIERS` | present |
| `aggregateParFromSimulation` | present |
| `generateScenarioPar` | present |
| `validateParResult` | present |
| `validateTierOrdering` | present |
| `resolveParForScenario` | present |

## Runtime & toolchain

### Required runtimes

| Runtime | Required | Source |
|---|---|---|
| Node.js | `>=22` | `package.json` `engines.node` |
| pnpm | `>=10` | `package.json` `engines.pnpm` |
| packageManager (Corepack pin) | `pnpm@10.32.1` | `package.json` `packageManager` |

### Per-workspace engine overrides

| Workspace | Engines |
|---|---|
| `apps/replay-producer/package.json` | node `>=22` |
| `apps/server/package.json` | node `>=22` |

### Key library versions

| Library | Package | Version(s) |
|---|---|---|
| Vue 3 | `vue` | ^3.4.27 |
| boardgame.io | `boardgame.io` | ^0.50.0 |
| Pinia | `pinia` | ^2.1.7 |
| Vite | `vite` | ^5.3.1 |
| TypeScript | `typescript` | ^5.4.5 |
| Zod | `zod` | ^3.23.8 |
| node-postgres | `pg` | ^8.13.0 |
| @vue/test-utils | `@vue/test-utils` | ^2.4.6 |

## Language footprint

Counts derived from on-disk file extensions under `apps/`, `packages/`, `scripts/`, `wiki/` (vendored / generated trees like `node_modules` and `dist` excluded). Extension-blind walk; `package.json` parsing not involved.

### By language (extension-classified)

| Language | Files |
|---|---:|
| TypeScript | 453 |
| Vue SFC | 90 |
| JSON | 84 |
| JavaScript | 70 |
| Markdown | 34 |
| HTML | 11 |
| CSS | 7 |
| PowerShell | 7 |
| TOML | 1 |

### By extension (raw)

| Extension | Files |
|---|---:|
| `.ts` | 451 |
| `.vue` | 90 |
| `.json` | 84 |
| `.js` | 37 |
| `.md` | 34 |
| `.mjs` | 32 |
| `.html` | 11 |
| `.css` | 7 |
| `.ps1` | 7 |
| `.png` | 6 |
| `.txt` | 4 |
| `.example` | 3 |
| `.d.ts` | 2 |
| `.cjs` | 1 |
| `.env` | 1 |
| `.gitignore` | 1 |
| `.hugo-version` | 1 |
| `.toml` | 1 |

### Toolchain vs source probes

Whether each non-Node language's toolchain marker files and source-file extensions are present anywhere in the scanned tree (or at the repo root for markers like `go.mod`). "Toolchain present + source absent" means the build pipeline depends on this language but no source code in this repo is written in it (e.g. Hugo is a Go binary).

| Language | Toolchain marker present | Source files present |
|---|---|---|
| Go | no | no |
| Python | no | no |
| Rust | no | no |
| Ruby | no | no |
| Java/Kotlin | no | no |
| Docker | no | no |
| Hugo (Go binary) | yes | no |

## Workspace

| Manifest | Name | Role | deps | devDeps | peerDeps |
|---|---|---|---:|---:|---:|
| `apps/arena-client/package.json` | @legendary-arena/arena-client | Gameplay client SPA for Legendary Arena (Vue 3 + Vite + Pinia, TypeScript) | 4 | 11 | 0 |
| `apps/dashboard/package.json` | @legendary-arena/dashboard | Internal admin dashboard SPA for Legendary Arena (Vue 3 + PrimeVue 4 + Vite) | 8 | 6 | 0 |
| `apps/legends-board/package.json` | @legendary-arena/legends-board | Public Legends Attract Board — read-only scoreboard SPA for legends.legendary-arena.com | 1 | 7 | 0 |
| `apps/registry-viewer/package.json` | registry-viewer | Client-only Registry Viewer for Legendary Arena (Vite + Vue 3) | 3 | 13 | 0 |
| `apps/replay-producer/package.json` | @legendary-arena/replay-producer | CLI Producer App (D-6301) that wraps buildSnapshotSequence with file I/O to emit deterministic ReplaySnapshotSequence JSON | 1 | 3 | 0 |
| `apps/server/package.json` | @legendary-arena/server | Legendary Arena boardgame.io game server — wiring layer only | 6 | 1 | 0 |
| `package.json` | legendary-arena | Legendary Arena monorepo — card registry, viewer, and tooling | 0 | 1 | 0 |
| `packages/game-engine/package.json` | @legendary-arena/game-engine | boardgame.io Game Engine for Legendary Arena | 1 | 2 | 0 |
| `packages/preplan/package.json` | @legendary-arena/preplan | Pre-Planning State Model & Lifecycle (Non-Authoritative, Per-Client) | 0 | 2 | 1 |
| `packages/registry/package.json` | @legendary-arena/registry | Card Data Access Layer for Legendary Arena | 1 | 7 | 0 |
| `packages/vue-sfc-loader/package.json` | @legendary-arena/vue-sfc-loader | Node module-loader hook that compiles Vue 3 Single-File Components for node:test consumers | 1 | 7 | 2 |

## Adopted libraries by category

### Framework — client

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `@vitejs/plugin-vue` | ^5.0.5 | 4 _(partial)_ | `apps/arena-client/package.json` (dev); `apps/dashboard/package.json` (dev); `apps/legends-board/package.json` (dev); `apps/registry-viewer/package.json` (dev) |
| `@vue/compiler-sfc` | ^3.4.27 | 1 _(minimal)_ | `packages/vue-sfc-loader/package.json` (dev); `packages/vue-sfc-loader/package.json` (peer) |
| `pinia` | ^2.1.7 | 31 _(comprehensive)_ | `apps/arena-client/package.json` (dep); `apps/dashboard/package.json` (dep) |
| `vite` | ^5.3.1 | 7 _(partial)_ | `apps/arena-client/package.json` (dev); `apps/dashboard/package.json` (dev); `apps/legends-board/package.json` (dev); `apps/registry-viewer/package.json` (dev) |
| `vue` | ^3.4.27 | 87 _(comprehensive)_ | `apps/arena-client/package.json` (dep); `apps/dashboard/package.json` (dep); `apps/legends-board/package.json` (dep); `apps/registry-viewer/package.json` (dep); `packages/vue-sfc-loader/package.json` (dev); `packages/vue-sfc-loader/package.json` (peer) |
| `vue-router` | ^4.3.2 | 6 _(partial)_ | `apps/dashboard/package.json` (dep) |

_Other candidates in this category not currently installed:_ `@vue/runtime-core`

### Framework — server

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `boardgame.io` | ^0.50.0 | 16 _(comprehensive)_ | `apps/arena-client/package.json` (dep); `apps/server/package.json` (dep); `packages/game-engine/package.json` (dep) |

_Other candidates in this category not currently installed:_ `koa`, `@koa/router`, `koa-bodyparser`, `koa-static`, `express`, `fastify`, `hono`

### Realtime / networking

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `socket.io`
- `socket.io-client`
- `ws`
- `sockjs`
- `sockjs-client`
- `engine.io`
- `engine.io-client`

### HTTP client

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `axios` | ^1.7.2 | 1 _(minimal)_ | `apps/dashboard/package.json` (dep) |

_Other candidates in this category not currently installed:_ `ofetch`, `ky`, `undici`

### Data fetching / cache

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `@tanstack/vue-query`
- `@tanstack/query-core`
- `swrv`

### Schema / validation

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `zod` | ^3.23.8 | 8 _(partial)_ | `apps/registry-viewer/package.json` (dep); `packages/registry/package.json` (dep) |

_Other candidates in this category not currently installed:_ `valibot`, `yup`, `joi`, `ajv`, `superstruct`

### Forms

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `vee-validate`
- `@formkit/core`
- `@formkit/vue`
- `@vuelidate/core`
- `@vuelidate/validators`

### Styling

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `tailwindcss`
- `unocss`
- `windicss`
- `sass`
- `postcss`
- `autoprefixer`
- `@unocss/preset-uno`

### UI component libraries

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `@primevue/themes` | ^4.0.0 | 1 _(minimal)_ | `apps/dashboard/package.json` (dep) |
| `primevue` | ^4.0.0 | 5 _(partial)_ | `apps/dashboard/package.json` (dep) |

_Other candidates in this category not currently installed:_ `primeicons`, `vuetify`, `naive-ui`, `element-plus`, `quasar`, `radix-vue`, `reka-ui`, `shadcn-vue`

### Charts / data viz

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `echarts` | ^5.5.0 | 3 _(partial)_ | `apps/dashboard/package.json` (dep) |
| `vue-echarts` | ^7.0.3 | 1 _(minimal)_ | `apps/dashboard/package.json` (dep) |

_Other candidates in this category not currently installed:_ `chart.js`, `vue-chartjs`, `d3`, `apexcharts`, `vue3-apexcharts`

### Icons

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `@iconify/vue`
- `@iconify/json`
- `lucide-vue-next`
- `heroicons`
- `unplugin-icons`

### Animation

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `gsap`
- `motion-v`
- `animejs`
- `@vueuse/motion`
- `lottie-web`
- `lottie-vue`
- `auto-animate`
- `@formkit/auto-animate`

### State (non-Pinia)

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `vuex`
- `zustand`
- `jotai`
- `xstate`

### Database

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `pg` | ^8.13.0 | 26 _(comprehensive)_ | `apps/server/package.json` (dep) |

_Other candidates in this category not currently installed:_ `postgres`, `drizzle-orm`, `prisma`, `@prisma/client`, `kysely`, `mysql2`, `sqlite3`, `better-sqlite3`

### Auth

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `@teamhanko/hanko-elements`
- `@teamhanko/hanko-frontend-sdk`
- `lucia`
- `oslo`
- `auth0`
- `next-auth`
- `better-auth`
- `jose`
- `jsonwebtoken`

### Storage / cloud

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `@aws-sdk/client-s3` | ^3.600.0 | 2 _(minimal)_ | `apps/server/package.json` (dep); `packages/registry/package.json` (dev) |

_Other candidates in this category not currently installed:_ `@aws-sdk/s3-request-presigner`, `aws-sdk`

### Testing

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `@vue/test-utils` | ^2.4.6 | 31 _(comprehensive)_ | `apps/arena-client/package.json` (dev); `packages/vue-sfc-loader/package.json` (dev) |
| `jsdom` | ^24.1.0 | 2 _(minimal)_ | `apps/arena-client/package.json` (dev); `packages/vue-sfc-loader/package.json` (dev) |

_Other candidates in this category not currently installed:_ `vitest`, `happy-dom`, `playwright`, `@playwright/test`, `cypress`, `msw`, `sinon`, `fast-check`

### A11y testing

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `axe-core`
- `@axe-core/playwright`
- `vitest-axe`
- `jest-axe`

### Lint / format

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `@typescript-eslint/eslint-plugin` | ^7.18.0 | 0 ⚠ | `apps/registry-viewer/package.json` (dev) |
| `@typescript-eslint/parser` | ^7.18.0 | 1 _(minimal)_ | `apps/registry-viewer/package.json` (dev) |
| `@vue/eslint-config-typescript` | ^13.0.0 | 1 _(minimal)_ | `apps/registry-viewer/package.json` (dev) |
| `eslint` | ^8.57.1 | 0 _(tooling)_ | `apps/registry-viewer/package.json` (dev) |
| `eslint-plugin-vue` | ^9.33.0 | 1 _(minimal)_ | `apps/registry-viewer/package.json` (dev) |
| `eslint-plugin-vuejs-accessibility` | ^2.5.0 | 1 _(minimal)_ | `apps/registry-viewer/package.json` (dev) |

_Other candidates in this category not currently installed:_ `prettier`, `typescript-eslint`

### Build / typecheck / transform

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `tsx` | ^4.15.7 | 0 _(tooling)_ | `apps/arena-client/package.json` (dev); `apps/dashboard/package.json` (dev); `apps/legends-board/package.json` (dev); `apps/registry-viewer/package.json` (dev); `apps/replay-producer/package.json` (dev); `apps/server/package.json` (dev); `packages/game-engine/package.json` (dev); `packages/preplan/package.json` (dev); `packages/registry/package.json` (dev); `packages/vue-sfc-loader/package.json` (dev) |
| `typescript` | ^5.4.5 | 1 _(minimal)_ | `apps/arena-client/package.json` (dev); `apps/dashboard/package.json` (dev); `apps/legends-board/package.json` (dev); `apps/registry-viewer/package.json` (dev); `apps/replay-producer/package.json` (dev); `package.json` (dev); `packages/game-engine/package.json` (dev); `packages/preplan/package.json` (dev); `packages/registry/package.json` (dev); `packages/vue-sfc-loader/package.json` (dep); `packages/vue-sfc-loader/package.json` (dev) |
| `vue-tsc` | ^2.0.19 | 0 _(tooling)_ | `apps/arena-client/package.json` (dev); `apps/dashboard/package.json` (dev); `apps/legends-board/package.json` (dev); `apps/registry-viewer/package.json` (dev) |

_Other candidates in this category not currently installed:_ `esbuild`, `rollup`, `unplugin-vue-components`, `unplugin-auto-import`

### Observability

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `@sentry/vue`
- `@sentry/node`
- `@sentry/browser`
- `pino`
- `winston`
- `@opentelemetry/api`
- `@opentelemetry/sdk-node`

### Date / time

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `dayjs`
- `date-fns`
- `luxon`

### Utilities

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `@vueuse/core`
- `@vueuse/integrations`
- `lodash`
- `lodash-es`
- `ramda`
- `remeda`

### Notifications / overlays

_No packages from this category are installed._

Candidates considered for this category (none adopted):

- `vue-toastification`
- `@kyvg/vue3-notification`
- `vue-sonner`
- `floating-vue`

### Other / uncategorized

Packages installed but not mapped to a category in this
script. Add to `CATEGORY_DEFINITIONS` if any of these
become load-bearing.

| Package | Version(s) | Files importing | Declared in |
|---|---|---:|---|
| `@cloudflare/workers-types` | ^4.20240620.0 | 0 ⚠ | `packages/registry/package.json` (dev) |
| `@legendary-arena/game-engine` | workspace:* | 79 _(comprehensive)_ | `apps/arena-client/package.json` (dev); `apps/replay-producer/package.json` (dep); `apps/server/package.json` (dep); `packages/preplan/package.json` (peer) |
| `@legendary-arena/preplan` | workspace:* | 9 _(partial)_ | `apps/arena-client/package.json` (dep) |
| `@legendary-arena/registry` | workspace:* | 15 _(comprehensive)_ | `apps/registry-viewer/package.json` (dep); `apps/server/package.json` (dep) |
| `@legendary-arena/vue-sfc-loader` | workspace:* | 0 ⚠ | `apps/arena-client/package.json` (dev) |
| `@types/jsdom` | ^21.1.7 | 0 _(tooling)_ | `apps/arena-client/package.json` (dev) |
| `@types/node` | ^22.19.17, ^25.6.0 | 4 _(partial)_ | `apps/arena-client/package.json` (dev); `apps/dashboard/package.json` (dev); `apps/legends-board/package.json` (dev); `apps/registry-viewer/package.json` (dev); `apps/replay-producer/package.json` (dev); `packages/registry/package.json` (dev); `packages/vue-sfc-loader/package.json` (dev) |
| `@vue/tsconfig` | ^0.5.1 | 2 _(minimal)_ | `apps/legends-board/package.json` (dev); `apps/registry-viewer/package.json` (dev) |
| `dotenv` | ^16.4.5 | 2 _(minimal)_ | `packages/registry/package.json` (dev) |
| `fast-glob` | ^3.3.2 | 0 ⚠ | `packages/registry/package.json` (dev) |
| `stripe` | 22.1.0 | 5 _(partial)_ | `apps/server/package.json` (dep) |

## SaaS / embedded services

Tools detected via static pattern-matching of source files
(HTML, JS, Vue templates, config). These do not appear in
`package.json` and would otherwise be invisible to
dependency-based inventory.

| Service | Category | Detected in | Description |
|---|---|---:|---|
| `brevo` | marketing / email | 1 file | Transactional + marketing email, newsletter forms, SMTP relay. |

### SaaS usage detail

#### brevo

- `wiki/brevo-email-pipeline.md`

## Importance tiering

Same packages as the category tables above, pivoted by **blast
radius if removed** instead of by concern. Three tiers:

- **Foundational** — replacing it means rewriting the
  architecture (engine model, runtime contract, schema
  discipline, or persistence story rests on this dep).
- **Adopted** — explicit framework choice locked by a WP or
  `DECISIONS.md` entry; replaceable with significant effort.
- **Tooling** — supports the dev / test / build loop;
  replaceable with low effort, no architectural surface depends
  on the choice.

Curation is a judgment call, not derived from data. Anything
installed but not yet placed surfaces under "Not yet classified".

### Foundational

| Package | Version(s) | Adoption | Files importing |
|---|---|---|---:|
| `boardgame.io` | ^0.50.0 | direct dep — `apps/arena-client/package.json`, `apps/server/package.json`, `packages/game-engine/package.json` | 16 _(comprehensive)_ |
| `pg` | ^8.13.0 | direct dep — `apps/server/package.json` | 26 _(comprehensive)_ |
| `typescript` | ^5.4.5 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json`, `apps/legends-board/package.json`, `apps/registry-viewer/package.json`, `apps/replay-producer/package.json`, `package.json`, `packages/game-engine/package.json`, `packages/preplan/package.json`, `packages/registry/package.json`, `packages/vue-sfc-loader/package.json` | 1 _(minimal)_ |
| `zod` | ^3.23.8 | direct dep — `apps/registry-viewer/package.json`, `packages/registry/package.json` | 8 _(partial)_ |

### Adopted

| Package | Version(s) | Adoption | Files importing |
|---|---|---|---:|
| `@koa/router` | 10.1.1 | transitive via `boardgame.io` | _(transitive)_ |
| `axios` | ^1.7.2 | direct dep — `apps/dashboard/package.json` | 1 _(minimal)_ |
| `echarts` | ^5.5.0 | direct dep — `apps/dashboard/package.json` | 3 _(partial)_ |
| `koa` | 2.16.4 | transitive via `boardgame.io` | _(transitive)_ |
| `pinia` | ^2.1.7 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json` | 31 _(comprehensive)_ |
| `primevue` | ^4.0.0 | direct dep — `apps/dashboard/package.json` | 5 _(partial)_ |
| `socket.io` | 3.1.2, 4.8.3 | transitive via `boardgame.io` | _(transitive)_ |
| `socket.io-client` | 4.8.3 | transitive via `boardgame.io` | _(transitive)_ |
| `vite` | ^5.3.1 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json`, `apps/legends-board/package.json`, `apps/registry-viewer/package.json` | 7 _(partial)_ |
| `vue` | ^3.4.27 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json`, `apps/legends-board/package.json`, `apps/registry-viewer/package.json`, `packages/vue-sfc-loader/package.json` | 87 _(comprehensive)_ |
| `vue-router` | ^4.3.2 | direct dep — `apps/dashboard/package.json` | 6 _(partial)_ |

### Tooling

| Package | Version(s) | Adoption | Files importing |
|---|---|---|---:|
| `@aws-sdk/client-s3` | ^3.600.0 | direct dep — `apps/server/package.json`, `packages/registry/package.json` | 2 _(minimal)_ |
| `@cloudflare/workers-types` | ^4.20240620.0 | direct dep — `packages/registry/package.json` | 0 ⚠ |
| `@types/jsdom` | ^21.1.7 | direct dep — `apps/arena-client/package.json` | 0 _(tooling)_ |
| `@types/node` | ^22.19.17, ^25.6.0 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json`, `apps/legends-board/package.json`, `apps/registry-viewer/package.json`, `apps/replay-producer/package.json`, `packages/registry/package.json`, `packages/vue-sfc-loader/package.json` | 4 _(partial)_ |
| `@typescript-eslint/eslint-plugin` | ^7.18.0 | direct dep — `apps/registry-viewer/package.json` | 0 ⚠ |
| `@typescript-eslint/parser` | ^7.18.0 | direct dep — `apps/registry-viewer/package.json` | 1 _(minimal)_ |
| `@vitejs/plugin-vue` | ^5.0.5 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json`, `apps/legends-board/package.json`, `apps/registry-viewer/package.json` | 4 _(partial)_ |
| `@vue/compiler-sfc` | ^3.4.27 | direct dep — `packages/vue-sfc-loader/package.json` | 1 _(minimal)_ |
| `@vue/eslint-config-typescript` | ^13.0.0 | direct dep — `apps/registry-viewer/package.json` | 1 _(minimal)_ |
| `@vue/test-utils` | ^2.4.6 | direct dep — `apps/arena-client/package.json`, `packages/vue-sfc-loader/package.json` | 31 _(comprehensive)_ |
| `@vue/tsconfig` | ^0.5.1 | direct dep — `apps/legends-board/package.json`, `apps/registry-viewer/package.json` | 2 _(minimal)_ |
| `dotenv` | ^16.4.5 | direct dep — `packages/registry/package.json` | 2 _(minimal)_ |
| `eslint` | ^8.57.1 | direct dep — `apps/registry-viewer/package.json` | 0 _(tooling)_ |
| `eslint-plugin-vue` | ^9.33.0 | direct dep — `apps/registry-viewer/package.json` | 1 _(minimal)_ |
| `eslint-plugin-vuejs-accessibility` | ^2.5.0 | direct dep — `apps/registry-viewer/package.json` | 1 _(minimal)_ |
| `fast-glob` | ^3.3.2 | direct dep — `packages/registry/package.json` | 0 ⚠ |
| `jsdom` | ^24.1.0 | direct dep — `apps/arena-client/package.json`, `packages/vue-sfc-loader/package.json` | 2 _(minimal)_ |
| `tsx` | ^4.15.7 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json`, `apps/legends-board/package.json`, `apps/registry-viewer/package.json`, `apps/replay-producer/package.json`, `apps/server/package.json`, `packages/game-engine/package.json`, `packages/preplan/package.json`, `packages/registry/package.json`, `packages/vue-sfc-loader/package.json` | 0 _(tooling)_ |
| `vue-tsc` | ^2.0.19 | direct dep — `apps/arena-client/package.json`, `apps/dashboard/package.json`, `apps/legends-board/package.json`, `apps/registry-viewer/package.json` | 0 _(tooling)_ |

### Not yet classified

Packages declared in some `package.json` but not yet placed
into Foundational / Adopted / Tooling. Add to
`IMPORTANCE_DEFINITIONS` near the top of the script when any
of these become load-bearing for the architecture.

- `@primevue/themes`
- `stripe`
- `vue-echarts`

## Anomalies

### Declared but no source imports detected

Heuristic: package appears in a `package.json` but no file
under `apps/`, `packages/`, or `scripts/` matches a
`from '<pkg>'` / `import('<pkg>')` / `require('<pkg>')`
pattern, **and** it is not referenced by any `tsconfig*.json`
(`extends` / `compilerOptions.types`) or `.eslintrc.*` /
`eslint.config.*` (`extends` / `parser` / `plugins`).
CLI-only tools (`tsx`, `vite`, `vue-tsc`, `eslint`,
`prettier`, `typescript`) are excluded as expected
zero-import.

| Package | Declared in |
|---|---|
| `@cloudflare/workers-types` | `packages/registry/package.json` (dev) |
| `@legendary-arena/vue-sfc-loader` | `apps/arena-client/package.json` (dev) |
| `@typescript-eslint/eslint-plugin` | `apps/registry-viewer/package.json` (dev) |
| `fast-glob` | `packages/registry/package.json` (dev) |

### Version drift across workspace

Same package declared with different version ranges in
different manifests. Worth aligning unless intentional.

| Package | Versions | Locations |
|---|---|---|
| `@types/node` | ^22.19.17, ^25.6.0 | `apps/arena-client/package.json` ^22.19.17; `apps/dashboard/package.json` ^22.19.17; `apps/legends-board/package.json` ^22.19.17; `apps/registry-viewer/package.json` ^22.19.17; `apps/replay-producer/package.json` ^22.19.17; `packages/registry/package.json` ^25.6.0; `packages/vue-sfc-loader/package.json` ^22.19.17 |

## tsconfig references

Packages reached via `tsconfig*.json` — `extends` and
`compilerOptions.types`. Source-file import counts miss
these because they live in JSON, but the deps are real
(removing them would break the build).

| tsconfig | Referenced packages |
|---|---|
| `apps/arena-client/tsconfig.json` | `@types/node`, `vite` |
| `apps/dashboard/tsconfig.json` | `@types/node`, `vite` |
| `apps/legends-board/tsconfig.json` | `@vue/tsconfig` |
| `apps/registry-viewer/tsconfig.json` | `@types/node`, `@vue/tsconfig`, `vite` |
| `apps/replay-producer/tsconfig.json` | `@types/node` |

## ESLint config references

Packages reached via `.eslintrc.*` or `eslint.config.*`
— `extends`, `parser`, `parserOptions.parser`, and
`plugins` string entries. ESLint resolves these via
shortname conventions (`'plugin:vue/...'` ->
`eslint-plugin-vue`), so the source-import scan misses
them entirely.

| Config file | Referenced packages |
|---|---|
| `apps/registry-viewer/.eslintrc.cjs` | `@typescript-eslint/parser`, `@vue/eslint-config-typescript`, `eslint-plugin-vue`, `eslint-plugin-vuejs-accessibility` |

## Transitive dependencies (lockfile)

Lockfile resolves **567** packages: **33** are direct dependencies declared in some `package.json`, **534** are transitive.

### Transitive packages matching tracked categories

These are dependencies you did **not** declare directly
but that pnpm resolved into the install tree. They are
reachable at runtime, so a "category not adopted" line
elsewhere in this report can still mean "we ship it
transitively."

| Package | Category | Resolved version(s) |
|---|---|---|
| `@koa/router` | Framework — server | 10.1.1 |
| `@vue/runtime-core` | Framework — client | 3.5.30 |
| `ajv` | Schema / validation | 6.14.0 |
| `engine.io` | Realtime / networking | 4.1.2, 6.6.6 |
| `engine.io-client` | Realtime / networking | 6.6.4 |
| `esbuild` | Build / typecheck / transform | 0.21.5, 0.27.4 |
| `koa` | Framework — server | 2.16.4 |
| `lodash` | Utilities | 4.18.1 |
| `postcss` | Styling | 8.5.8 |
| `rollup` | Build / typecheck / transform | 4.60.0 |
| `socket.io` | Realtime / networking | 3.1.2, 4.8.3 |
| `socket.io-client` | Realtime / networking | 4.8.3 |
| `ws` | Realtime / networking | 7.4.6, 8.18.3 |

## Architecture-doc cross-reference

Heuristic comparison: which package names appear in
backticks inside the architecture docs vs. which are
actually installed. Mismatches are not errors — docs may
reference deferred items (e.g., Hanko) — but they are worth
a reviewer's eye.

### `docs/ai/ARCHITECTURE.md`

- Package mentions in doc: **10**
- Mentioned in doc but not installed: **2**

  - `@koa/router`
  - `koa`

- Installed but never mentioned in doc: **18**

  - `@aws-sdk/client-s3`
  - `@primevue/themes`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `@vitejs/plugin-vue`
  - `@vue/eslint-config-typescript`
  - `axios`
  - `echarts`
  - `eslint`
  - `eslint-plugin-vue`
  - `eslint-plugin-vuejs-accessibility`
  - `pinia`
  - `primevue`
  - `tsx`
  - `vite`
  - `vue-echarts`
  - `vue-router`
  - `vue-tsc`

### `docs/02-ARCHITECTURE.md`

- Package mentions in doc: **7**
- Mentioned in doc but not installed: **3**

  - `@koa/router`
  - `jsonwebtoken`
  - `koa`

- Installed but never mentioned in doc: **22**

  - `@aws-sdk/client-s3`
  - `@primevue/themes`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `@vitejs/plugin-vue`
  - `@vue/eslint-config-typescript`
  - `@vue/test-utils`
  - `axios`
  - `echarts`
  - `eslint`
  - `eslint-plugin-vue`
  - `eslint-plugin-vuejs-accessibility`
  - `jsdom`
  - `pinia`
  - `primevue`
  - `tsx`
  - `typescript`
  - `vite`
  - `vue-echarts`
  - `vue-router`
  - `vue-tsc`
  - `zod`

## How to use this report

1. Open this file alongside `docs/02-ARCHITECTURE.md`.
2. Paste both into the gap-analysis prompt
   (`scripts/architecture-inventory.prompt.md` if you keep
   it, or the prompt in your prior chat) and ask for
   prioritized recommendations.
3. The "Declared but no source imports" table is the
   highest-signal section — it surfaces deferred work and
   accidental dependencies in seconds.

### Running the script

```bash
# Baseline — npm deps + import graph only (no SaaS detection):
node scripts/architecture-inventory.mjs --out wiki/architecture-inventory.md

# With marketing website repo — includes SaaS / embedded service detections
# (Brevo, Snipcart, etc.) from the legendary-arena-com repo:
node scripts/architecture-inventory.mjs --out wiki/architecture-inventory.md \
  --external C:\www\legendary-arena-com
```

The `--external <path>` flag is repeatable — add as many
sibling repos as needed. Each external repo's files appear
prefixed with `[repo-name]` in the SaaS detail section
so you can tell at a glance which repo a detection came from.

### Automated updates

This report is regenerated automatically by
`.github/workflows/architecture-inventory.yml` on a weekly
cron schedule (Mondays 06:00 UTC). The workflow:

1. Checks out both this repo and
   `legendary-arena/legendary-arena-website` (for SaaS
   detection).
2. Runs the inventory script with `--external` pointed at
   the website checkout.
3. If the output differs from the committed copy, opens a PR
   on the `bot/architecture-inventory-refresh` branch for
   human review.
4. If no diff, no-ops silently.

The workflow can also be triggered manually via
`workflow_dispatch` in the GitHub Actions UI. Hand-edits to
this file are non-authoritative and will be overwritten by
the next cron run.
