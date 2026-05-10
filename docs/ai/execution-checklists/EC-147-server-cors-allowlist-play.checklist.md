# EC-147 — Server CORS Allowlist for play.* Origins (Execution Checklist)

**Source:** External — `legendary-arena/legendary-arena-website` repo,
`docs/ai/work-packets/WP-007a-play-deploy.md` (marketing-side WP).
This is a follow-on errata EC to **EC-146**, surfaced during WP-007a
Step 9 verification when the production lobby fetch from
`legendary-arena-play.pages.dev` failed CORS.

**Layer:** `apps/server/**` only. No engine, registry, preplan, or
arena-client change. Single-file edit + two-line allowlist amendment.

## Provenance

WP-007a Step 9 verification surfaced two production-readiness gaps in
the arena-client → game-server connection that the original WP-007a
session prompt did not enumerate:

1. **`VITE_SERVER_URL` env var unset on CF Pages.** The arena-client
   source contract at
   `apps/arena-client/src/lobby/lobbyApi.ts:14-21` documents that this
   env var is required for production builds — the
   `http://localhost:8000` fallback "must never reach production." The
   WP-007a Step 7 env-var lock missed this.
2. **`apps/server/src/server.mjs` CORS allowlist did not include
   play.* origins.** The boardgame.io `Server({ origins: [...] })`
   array listed only `https://cards.barefootbetters.com` and
   `http://localhost:5173` at the time of WP-007a Step 9 probe.
   `https://api.legendary-arena.com` returned 200 to a HEAD probe from
   `https://legendary-arena-play.pages.dev` Origin but with no
   `Access-Control-Allow-Origin` header, which is boardgame.io's
   `Server` `cors`-package behavior when the request Origin is not in
   the allowlist.

This EC scopes Gap 2. Gap 1 is a CF Pages dashboard env-var change
(`VITE_SERVER_URL = https://api.legendary-arena.com`, Production
scope) handled outside this EC by the operator. Both must land before
WP-007a Step 11 console-clean and game-flow smoke-test DoD bullets can
pass on the live URL.

## Before Starting

- [ ] EC-146 merged on `main` (`dcc62ef` or successor)
- [ ] WP-007a Step 7 CF Pages project `legendary-arena-play` exists,
      builds from `main`, and is reachable at
      `https://legendary-arena-play.pages.dev`
- [ ] Operator has confirmed they will set
      `VITE_SERVER_URL = https://api.legendary-arena.com` in CF Pages
      env (Production scope) and trigger a redeploy after this EC's
      server change deploys to Render
- [ ] `pnpm install --frozen-lockfile && pnpm -r build` succeeds from
      a clean tree (registry, game-engine, vue-sfc-loader, preplan,
      arena-client, server all build)
- [ ] `pnpm --filter @legendary-arena/server test` passes baseline
      (250 / 184 pass / 66 skipped requires-test-database / 0 fail at
      EC-146 lock; same baseline expected after this EC's edit)

## Locked Values (do not re-derive)

- **Origins added to `apps/server/src/server.mjs` allowlist:**
  - `https://play.legendary-arena.com` — production arena-client custom
    domain (post-WP-007a Step 10)
  - `https://legendary-arena-play.pages.dev` — CF Pages auto-generated
    hostname (used during WP-007a Step 9 build-parity check before
    custom domain binds; remains the stable preview-target for any
    environment where the custom domain is unbound)
- **Origins preserved (untouched):**
  - `https://cards.barefootbetters.com` — registry-viewer SPA
  - `http://localhost:5173` — Vite dev server default
- **Branch-prefixed CF Pages preview deploy URLs**
  (e.g., `https://<branch>.legendary-arena-play.pages.dev`) are NOT
  added in this EC. boardgame.io's `Server` `origins` option uses
  cors-package allowlist matching, which expects exact strings;
  wildcard hostname patterns are not supported in this option's
  contract. Branch preview deploys will fail CORS on the lobby fetch
  the same way the live URL did before this EC. That gap is small
  blast-radius (preview deploys are short-lived; the brand-integration
  visual check on a preview deploy doesn't depend on lobby API) and is
  scope-deferred to a follow-up if needed.
- **No env-var-driven origin configuration in this EC.** The existing
  contract has the allowlist as a literal array per code-style Rule 7.
  Switching to env-var-driven origin lists would be a structural
  refactor of `server.mjs` outside the scope of this errata.

## Guardrails

- **No game logic.** Server is a wiring layer per
  `.claude/rules/server.md`. CORS allowlist is wiring; allowed.
- **No persistence.** No `G` / `ctx` / database touch.
- **No engine package change.** `packages/game-engine/`,
  `packages/registry/`, `packages/preplan/` byte-identical to HEAD.
- **No arena-client change.** `apps/arena-client/**` byte-identical to
  HEAD.
- **No new runtime npm dependencies.** `pnpm-lock.yaml` byte-identical
  to HEAD.
- **No render.yaml / Render dashboard change.** The Render deploy
  reads `apps/server/src/server.mjs` from `main`; pushing this EC's
  commit to `main` triggers Render's automatic redeploy. No operator
  action needed on the Render side beyond confirming the redeploy
  completes.

## Required `// why:` Comments

- `apps/server/src/server.mjs` `Server({ origins: [...] })` block:
  expand the existing `// why: CORS origins are written as a literal
  array per code style Rule 7` comment to enumerate (a) the production
  arena-client SPA at `https://play.legendary-arena.com`, (b) the
  CF Pages auto-generated `legendary-arena-play.pages.dev` hostname
  for build-parity verification, (c) backward-compatibility rationale
  for retaining `https://cards.barefootbetters.com`, and (d) the
  `localhost:5173` Vite dev-server entry.

## Files to Produce

**Modified:**
- `apps/server/src/server.mjs` — two new entries in the
  `Server({ origins: [...] })` literal array; expanded `// why:`
  comment block enumerating each entry's purpose.
- `docs/ai/execution-checklists/EC_INDEX.md` — Phase 7 row added for
  EC-147.

**Created:**
- `docs/ai/execution-checklists/EC-147-server-cors-allowlist-play.checklist.md`
  (this file).

**Explicitly NOT touched:** every path under `packages/`,
`apps/arena-client/`, `apps/registry-viewer/`, `apps/replay-producer/`,
`apps/wiki-viewer/`, `data/`, `scripts/`, root `package.json`,
`pnpm-lock.yaml`, root `tsconfig.json`, `render.yaml`. Verify via
`git diff --stat <those paths>` shows empty.

## After Completing

- [ ] `apps/server/src/server.mjs` has 4 entries in the `origins`
      array: `https://play.legendary-arena.com`,
      `https://legendary-arena-play.pages.dev`,
      `https://cards.barefootbetters.com`, `http://localhost:5173`
- [ ] `pnpm --filter @legendary-arena/server test` passes with the
      same 250/184/66/0 baseline as at EC-146 lock
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] `git diff --stat packages/ apps/arena-client/ apps/registry-viewer/
      apps/replay-producer/ apps/wiki-viewer/ data/ scripts/` empty
- [ ] After commit + push to `main`, Render auto-redeploys
      `legendary-arena-server`; `curl -I -H "Origin:
      https://legendary-arena-play.pages.dev"
      https://api.legendary-arena.com/games/legendary-arena` returns
      200 + `Access-Control-Allow-Origin:
      https://legendary-arena-play.pages.dev` (or `*` if the cors
      package upgrades behavior, but the allowlist match itself
      surfaces in either form)
- [ ] After operator sets `VITE_SERVER_URL =
      https://api.legendary-arena.com` in CF Pages env (Production
      scope) and triggers a CF redeploy, the production
      `https://legendary-arena-play.pages.dev/` and
      `https://play.legendary-arena.com/` lobby fetches succeed in
      DevTools Network with HTTP 200 and a populated matches array
      (or `[]` when no matches exist), and the DevTools Console shows
      no `localhost:8000` connection errors

## Common Failure Smells

- **CORS still fails after this EC's deploy** — most likely because
  Render hasn't redeployed yet (Render's GitHub auto-deploy can lag
  several minutes). Verify the most recent successful deploy on
  Render's dashboard reflects this EC's commit hash before declaring
  the EC failed.
- **CORS works on api.* probes but lobby still fails on play.*** —
  Gap 1 (`VITE_SERVER_URL`) likely still unset. Verify CF Pages env
  has `VITE_SERVER_URL = https://api.legendary-arena.com` (Production
  scope) and that the CF deploy triggered after the env-var change.
- **CORS works on `legendary-arena-play.pages.dev` but fails on
  `play.legendary-arena.com`** — confirm both origins are in the
  `origins` array verbatim. Allowlist matching is exact-string; a
  trailing slash or scheme mismatch fails.
- **Branch preview deploy at `<branch>.legendary-arena-play.pages.dev`
  fails CORS** — expected behavior. Branch-prefixed preview hostnames
  are not in this EC's allowlist (no wildcard support). Lobby is not
  exercised in the WP-007a preview-deploy DoD bullet (only the brand
  integration is); not a blocker.
