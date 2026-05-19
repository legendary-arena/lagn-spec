---
title: Operational Health Checks
type: Tool
tags:
  - health-check
  - operations
  - tooling
  - cloudflare
  - hanko
  - render
  - domains
related: []
status: canonical
source:
  - ../scripts/check-connections.mjs
  - ../scripts/check-subdomains.mjs
  - ../docs/ops/domains.json
  - ../docs/ops/DOMAINS.md
  - ../package.json
last-reviewed: 2026-05-19
---

## Summary

Two operator-facing scripts probe the runtime perimeter of the
Legendary Arena platform: [`scripts/check-connections.mjs`](../scripts/check-connections.mjs)
verifies environment, toolchain, and connectivity to every external
service the engine and apps depend on; [`scripts/check-subdomains.mjs`](../scripts/check-subdomains.mjs)
walks the canonical domain manifest at
[`docs/ops/domains.json`](../docs/ops/domains.json) and classifies
each entry against its declared `live` / `planned` state, with
DNS + TLS diagnostics on every failed or pending row. Both are
invoked via pnpm aliases (`pnpm check`, `pnpm check:domains`,
`pnpm check:incident`) and are the first diagnostic step when
something looks broken in production.

## Mechanics

### `pnpm check` — connection health

[`scripts/check-connections.mjs`](../scripts/check-connections.mjs)
runs four phases in order. Each check records a result with a
status glyph (`✓` pass, `⚠` warning, `✗` failure) and, on failure,
a one-line remediation pointing at the dashboard surface or command
that fixes it.

| Phase | Check | What it verifies |
|---|---|---|
| ENVIRONMENT | `.env file` | `.env` exists at repo root |
| ENVIRONMENT | `.env vs .env.example` | `.env` is not a verbatim copy of `.env.example` |
| ENVIRONMENT | `.env placeholders` | No `your-…`, `change-me`, `REPLACE_…`, or empty values remain |
| REQUIRED VARIABLES | `env vars` | All 11 required vars present and non-empty across Database, Auth, Game Server, Cloudflare, Frontend groups |
| TOOLS | `Node.js` | Major version ≥ 22 |
| TOOLS | `pnpm` | Installed and major version ≥ 8 |
| TOOLS | `dotenv-cli` | Installed; `.env` is parseable |
| TOOLS | `boardgame.io` | Installed at `0.50.x` (the project's locked range); CJS server entrypoint present |
| TOOLS | `zod` | Installed in some workspace's `node_modules` |
| TOOLS | `pnpm lockfile` | `pnpm install --frozen-lockfile --offline` succeeds — catches the `ERR_PNPM_OUTDATED_LOCKFILE` drift that breaks CF Pages deploys |
| CONNECTIONS | `PostgreSQL` | `DATABASE_URL` resolves; `SELECT current_database(), version()` returns; optional `EXPECTED_DB_NAME` match |
| CONNECTIONS | `boardgame.io server` | `GAME_SERVER_URL/health` returns HTTP 200 AND `Content-Type` starts with `application/json` AND body is non-empty. Catches a CDN cache page or reverse-proxy default page returning a stale 200 in place of the real route. |
| CONNECTIONS | `Cloudflare R2` | `R2_PUBLIC_URL/metadata/sets.json` returns HTTP 200; 403s are diagnosed by header inspection (edge bot rule vs Super Bot Fight Mode vs R2 backend) |
| CONNECTIONS | `Cloudflare R2 CORS` | `OPTIONS R2_PUBLIC_URL/metadata/sets.json` from the arena-client origin returns an allow-origin header that matches. Recorded as a **warning**, not a failure — the SPA currently consumes R2 assets via `<img>` (which bypasses CORS); promote to failure when any code path `fetch()`es an R2 asset |
| CONNECTIONS | `Cloudflare Pages` | `CF_PAGES_URL` (registry-viewer project) returns HTTP 200; same three-layer 403 diagnosis as R2 |
| CONNECTIONS | `Hanko JWKS` | `HANKO_TENANT_BASE_URL/.well-known/jwks.json` returns a well-formed JWKS with ≥ 1 key |
| CONNECTIONS | `Hanko tenant CORS` | `OPTIONS HANKO_TENANT_BASE_URL/me` from the arena-client origin returns an allow-origin header that matches |
| CONNECTIONS | `API server CORS` | `OPTIONS GAME_SERVER_URL/api/me/profile` from the arena-client origin returns an allow-origin header that matches |
| CONNECTIONS | `Arena-client bundle env` | Fetches the deployed SPA's main JS bundle and asserts `VITE_HANKO_TENANT_BASE_URL` and `VITE_API_BASE_URL` are inlined (i.e., the literal env-var name does **not** appear in the bundle) |
| CONNECTIONS | `GitHub API` | `https://api.github.com/repos/barefootbetters/legendary-arena` resolves; 403 with `x-ratelimit-remaining: 0` downgrades to a warning |
| CONNECTIONS | `Git remote` | Local `origin` points at `barefootbetters/legendary-arena` |
| CONNECTIONS | `rclone config` | Config exists at `%APPDATA%\rclone\rclone.conf` (warning if absent) |
| CONNECTIONS | `rclone binary` | `rclone version` runs |
| CONNECTIONS | `rclone R2 bucket` | `rclone lsd r2:legendary-images` returns ≥ 1 folder |

All CONNECTIONS checks run concurrently via `Promise.allSettled` so
the suite finishes in roughly the slowest probe plus rclone's serial
tail (typically ~8–11 seconds end-to-end).

The four auth-stack checks (`pnpm lockfile`, `Hanko tenant CORS`,
`API server CORS`, `Arena-client bundle env`) were added on
2026-05-18 to surface operational misconfigurations that each cost
roughly half a day to diagnose during the WP-160 / WP-161 smoke
verification (per the inline comment at
[`scripts/check-connections.mjs`](../scripts/check-connections.mjs)
lines 802–813). The `Cloudflare R2 CORS` warning row was added on
2026-05-19.

The three SPA-origin probes (`Hanko tenant CORS`, `API server CORS`,
`Arena-client bundle env`) and the new `Cloudflare R2 CORS` warning
all derive their `Origin` from `resolveArenaClientUrl()`, which
defaults to `https://play.legendary-arena.com` (the production custom
domain) as of 2026-05-19. Operators can override with
`ARENA_CLIENT_URL=<url>` for staging or branch-preview verification;
the underlying CF Pages hostname `legendary-arena-play.pages.dev` is
already in the server's `Server({ origins })` allowlist (EC-147) and
is exercised independently by `check-subdomains.mjs`.

Exit code is `0` when no failures occurred (warnings do not fail the
run, so partially-configured local dev environments still pass) and
`1` otherwise. The script prints a final summary listing every
failure and warning with its remediation hint.

### `pnpm check:domains` — subdomain reachability

[`scripts/check-subdomains.mjs`](../scripts/check-subdomains.mjs)
reads the canonical manifest at
[`docs/ops/domains.json`](../docs/ops/domains.json) and fires a
`GET` with `redirect: 'manual'` and a 10 s timeout against every
entry. The probe result (HTTP status or network error) is classified
against the entry's declared `state`:

| `state` | Probe outcome | Verdict |
|---|---|---|
| `live` | status matches `expectedStatus` | `OK` |
| `live` | anything else | `FAIL` |
| `planned` | network error (DNS, refused, timeout) | `PENDING` |
| `planned` | status matches `expectedStatus` | `READY` — flip `state` to `live` in the manifest |
| `planned` | status mismatches `expectedStatus` | `FAIL` |

A `--live-only` flag skips `planned` entries entirely, printing
them as `SKIP` rows. The runbook at
[`docs/ops/DOMAINS.md`](../docs/ops/DOMAINS.md) holds per-anchor
remediation notes; on `FAIL`, the script prints the runbook anchor
alongside the failed row.

Exit codes: `0` on no failures (`PENDING` and `READY` do not fail
the run), `1` on at least one `FAIL`, `2` on an unexpected internal
error (manifest unreadable, JSON parse failure).

**Per-row diagnostic enrichment (added 2026-05-19):**

- **Structured error codes.** On probe failure, the row prints the
  Node error code (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`,
  `ERR_TLS_CERT_ALTNAME_INVALID`, etc.) in front of the prose
  message. The code is pulled from `error.cause.code` (where undici
  wraps the underlying socket error) with a fallback to
  `error.code` and a final fallback to `ETIMEDOUT` when the abort
  signal fired.
- **Location header.** On any 30x response, the row prints a
  `location:` sub-line with the redirect target. This catches
  apex-canonicalization misroutes (wrong host, wrong scheme,
  redirect loops) that are invisible if you only check status.
- **`expectedLocation` enforcement.** When a manifest entry declares
  an optional `expectedLocation` string, the probe asserts the
  response's `Location` header **starts with** that value. A
  mismatch downgrades the verdict from `OK` to `FAIL` and prints
  `redirect mismatch: expected prefix "…", got "…"` inline. Used
  today on the apex entry (target `https://www.legendary-arena.com/`)
  and the ewiki entry (target `https://legendary-arena.cloudflareaccess.com/`).
  Prefix-match keeps the field robust against query-string variation
  (the Cloudflare Access login URL embeds a per-request JWT) while
  still catching wrong host, HTTP downgrade, or redirect-to-default-
  page misconfigurations. Documented in
  [`docs/ops/DOMAINS.md §Adding a new subdomain`](../docs/ops/DOMAINS.md#adding-a-new-subdomain).
- **DNS + TLS diagnosis on FAIL and PENDING.** Failed and pending
  rows trigger a parallel DNS (`A` + `AAAA` via `node:dns/promises`)
  and TLS handshake (`node:tls` with SNI set to the probed
  hostname); results print as `dns:` and `tls:` sub-lines. This
  disambiguates "subdomain not yet provisioned" (`A=[ENOTFOUND]`)
  from "DNS up, cert misconfigured" (resolved A + TLS error) without
  a separate `dig` / `openssl s_client` run.

The diagnostics are slow-path only — successful `OK` rows do not
pay the DNS + TLS cost.

### `pnpm check:incident` — combined run

[`package.json`](../package.json) exposes a chained alias that runs
`check-connections.mjs` then `check-subdomains.mjs --live-only` and
short-circuits on the first failure. Use this as the single entry
point when `legendary-arena.com` is reported broken — it covers
every external dependency and every live subdomain in one run.

### Latest run snapshot — 2026-05-19

Both scripts were run from
[`C:\pcloud\BB\DEV\legendary-arena\`](../) (the only checkout with a
populated `.env`) against the worktree's copy of each script
(`claude/nostalgic-bouman-bab6e8`), which now contains the
2026-05-19 enhancements:
- R2 CORS warning row
- SPA origin defaulted to `play.legendary-arena.com`
- Structured error codes in probe failures
- Location header on every 30x row
- `expectedLocation` prefix enforcement (apex + ewiki)
- DNS + TLS diagnosis on FAIL / PENDING rows
- `/health` content-type + body-length validation

`pnpm check`:

```
=== Legendary Arena — Connection Health Check ===
Run at: 2026-05-19T14:27:19.222Z
Machine: L-1005146  Node: v24.15.0  Platform: win32

ENVIRONMENT
  ✓ .env file : .env file found
  ✓ .env vs .env.example : .env differs from .env.example

REQUIRED VARIABLES
  Database           ✓ DATABASE_URL  ✓ EXPECTED_DB_NAME
  Auth               ✓ JWT_SECRET  ✓ HANKO_TENANT_BASE_URL  ✓ HANKO_EXPECTED_AUDIENCE
  Game Server        ✓ NODE_ENV  ✓ GAME_SERVER_URL  ✓ PORT
  Cloudflare         ✓ R2_PUBLIC_URL  ✓ CF_PAGES_URL
  Frontend (Vite)    ✓ VITE_GAME_SERVER_URL
  ✓ env vars : All 11 required variables are present.

TOOLS
  ✓ Node.js : v24.15.0
  ✓ pnpm : v10.32.1
  ✓ dotenv-cli : v11.0.0
  ✓ boardgame.io : v0.50.2 (server entrypoint verified)
  ✓ zod : v3.25.76
  ✓ pnpm lockfile : pnpm-lock.yaml specifiers match every package.json manifest.

CONNECTIONS (concurrent)
  ✓ Cloudflare R2 CORS : https://data.barefootbetters.com/metadata/sets.json allows Origin=https://play.legendary-arena.com  (HTTP 204, 138ms)
  ✓ PostgreSQL : legendary_arena — PostgreSQL 18.3  (232ms)
  ✓ Cloudflare R2 : metadata/sets.json → 200 application/json  (197ms)
  ✓ boardgame.io server : /health → 200 application/json 15B  (310ms)
  ✓ Cloudflare Pages : https://cards.barefootbetters.com → 200  (301ms)
  ✓ API server CORS : https://legendary-arena-server.onrender.com/api/me/profile allows Origin=https://play.legendary-arena.com  (HTTP 204, 335ms)
  ✓ Arena-client bundle env : https://play.legendary-arena.com/assets/index-BaZEBP-t.js has all required VITE_* env vars inlined.
  ✓ GitHub API : barefootbetters/legendary-arena found  (563ms)
  ✓ Git remote : origin → https://github.com/barefootbetters/legendary-arena.git
  ✓ Hanko JWKS : https://cfd0ef6d-6cb9-43a6-83c1-9956bb93bd2e.hanko.io/.well-known/jwks.json → 200 2 keys  (897ms)
  ✓ Hanko tenant CORS : https://cfd0ef6d-6cb9-43a6-83c1-9956bb93bd2e.hanko.io/me allows Origin=https://play.legendary-arena.com  (HTTP 204, 897ms)
  ✓ rclone config : Config found at C:\Users\jjensen\AppData\Roaming\rclone\rclone.conf
  ✓ rclone binary : rclone v1.73.3
  ✓ rclone R2 bucket : bucket root: 45 folders

===
SUMMARY: All checks passed.  (6127ms)
```

`pnpm check:domains` (with the new per-row diagnostics; Cloudflare
Access JWT in the `ewiki` Location elided for readability — the real
output prints the full URL):

```
[check-subdomains] manifest: docs/ops/domains.json (version 1, updated 2026-05-10)
[check-subdomains] runbook:  docs/ops/DOMAINS.md
[check-subdomains] entries:  10 (probing all)

[OK     ] Apex (legendary-arena.com)               https://legendary-arena.com                             HTTP 301                                 expected=301|302|308 state=live
        location: https://www.legendary-arena.com/
[OK     ] Marketing (www)                          https://www.legendary-arena.com                         HTTP 200                                 expected=200 state=live
[OK     ] Game client (play)                       https://play.legendary-arena.com                        HTTP 200                                 expected=200 state=live
[READY  ] Registry viewer (cards)                  https://cards.legendary-arena.com                       HTTP 200                                 expected=200 state=planned
        hint:    DNS resolves and probe is healthy. Flip "state" to "live" in docs/ops/domains.json.
[PENDING] Public player wiki                       https://wiki.legendary-arena.com                        error: ENOTFOUND (fetch failed)          expected=200 state=planned
        dns:     A=[ENOTFOUND]  AAAA=[ENOTFOUND]
        tls:     ENOTFOUND
[OK     ] Engineering wiki (private, gated)        https://ewiki.legendary-arena.com                       HTTP 302                                 expected=302|401|403 state=live
        location: https://legendary-arena.cloudflareaccess.com/cdn-cgi/access/login/ewiki.legendary-arena.com?…
[PENDING] Legends scoreboard (public attract board) https://legends.legendary-arena.com                     error: ENOTFOUND (fetch failed)          expected=200 state=planned
        dns:     A=[ENOTFOUND]  AAAA=[ENOTFOUND]
        tls:     ENOTFOUND
[OK     ] API (game server, friendly hostname)     https://api.legendary-arena.com/health                  HTTP 200                                 expected=200 state=live
[OK     ] API (Render canonical hostname)          https://legendary-arena-server.onrender.com/health      HTTP 200                                 expected=200 state=live
[OK     ] Card images CDN                          https://images.barefootbetters.com/                     HTTP 404                                 expected=200|403|404 state=live

[check-subdomains] 7 ok, 2 pending, 1 ready-to-flip, 0 failed
[check-subdomains] 1 planned entry is reachable and healthy — flip "state" to "live" in docs/ops/domains.json.
```

Headline reading: every `live` domain is healthy and canonicalizes
correctly (apex → `www.legendary-arena.com/`; ewiki → Cloudflare
Access gate); every infrastructure dependency is reachable; the
`cards.legendary-arena.com` row is ready to be flipped from
`planned` to `live` in the manifest (a follow-up edit to
[`docs/ops/domains.json`](../docs/ops/domains.json), not a deploy
action). The two `planned` entries — `wiki.legendary-arena.com` and
`legends.legendary-arena.com` — are confirmed unprovisioned: DNS
returns `ENOTFOUND` on both A and AAAA, and the TLS handshake
fails the same way, ruling out half-provisioned states.

## Interactions

- **Engine vs. ops boundary.** Both scripts live at `scripts/` and
  read configuration from `.env` and `docs/ops/domains.json`. They
  do not import from `packages/game-engine/**`, `packages/registry/**`,
  or `packages/preplan/**`, and they do not introduce any new
  runtime contract for those packages. They are operator tooling —
  parallel to the engine, not part of it.
- **`apps/server`.** `check-connections.mjs` probes the
  `/health` route registered in
  [`apps/server/src/server.mjs`](../apps/server/src/server.mjs)
  and the `/api/me/profile` CORS surface declared in the same file.
  The `API server CORS` check's remediation points at the
  `Server({ origins: [...] })` allowlist there and cites EC-147 as
  the canonical add pattern.
- **Hanko verifier mirror.** `check-connections.mjs` builds the
  JWKS URL by appending `/.well-known/jwks.json` to
  `HANKO_TENANT_BASE_URL`, deliberately mirroring the resolution in
  [`apps/server/src/auth/hanko/hankoVerifier.logic.ts`](../apps/server/src/auth/hanko/hankoVerifier.logic.ts)
  (WP-126 / D-12602) so the probe exercises the exact endpoint the
  server hits at runtime. The script does not import the verifier —
  it stays self-contained like every other CONNECTIONS check.
- **Arena-client bundle inspection.** The `Arena-client bundle env`
  check fetches the deployed SPA at the URL resolved by
  `resolveArenaClientUrl()` (env `ARENA_CLIENT_URL` overrides;
  default `https://legendary-arena-play.pages.dev`) and grep-matches
  the main JS bundle for literal `VITE_*` env-var names. A match
  means Vite did not inline a value at build time — the operator
  must set the missing var in the CF Pages project's Production
  scope and trigger a new deployment (CF Pages does not auto-rebuild
  on env-var changes).
- **Domain manifest authoring.** `check-subdomains.mjs` reads
  [`docs/ops/domains.json`](../docs/ops/domains.json); the human
  runbook at [`docs/ops/DOMAINS.md`](../docs/ops/DOMAINS.md) is the
  per-anchor remediation surface. Adding or moving a subdomain
  requires updating both files in the same change.
- **CI / deploy.** Neither script is currently wired into a CI
  workflow; both are local-operator probes. They make no
  modifications to any service — every probe is a read.

## Edge Cases

- **`pnpm check` requires `.env`.** Both scripts must be run from a
  checkout that has a populated `.env`. Worktrees created by the
  Claude Code worktree workflow start without `.env` (and without
  `node_modules`). To run today, `cd C:\pcloud\BB\DEV\legendary-arena`
  first; or pass `--env-file=<absolute path to .env>` and an
  absolute script path to `node`.
- **`EXPECTED_DB_NAME` is optional.** If set, it must match the
  database the `DATABASE_URL` resolves to or the PostgreSQL check
  fails. Remove the variable from `.env` to skip the cross-check —
  the failure message says so explicitly.
- **GitHub API rate limit.** Anonymous GitHub API calls are capped
  at 60 / hour. A 403 with `x-ratelimit-remaining: 0` downgrades to
  a warning rather than a failure — the local Git remote check on
  the next line still verifies repo identity, so the overall
  configuration is unambiguously correct even when the API probe is
  rate-limited.
- **Three-layer Cloudflare 403.** A 403 from `R2_PUBLIC_URL` or
  `CF_PAGES_URL` can originate from at least three distinct layers:
  edge bot rules, CDN-tier Super Bot Fight Mode, or the R2 / Pages
  backend itself. The script's 403 branch inspects the `server`
  header and `cf-cache-status` presence to point at the correct
  dashboard surface (Security → Bots vs. backend access policies).
  Generic 403 messages without this diagnosis sent multiple
  past sessions down the wrong remediation path.
- **`READY` is not a failure.** A `planned` entry that probes
  healthy returns `READY`, signalling that the deploy is live and
  the manifest needs a one-line edit to flip `state` to `live`. The
  script does not modify the manifest — it prints the hint and
  exits 0.
- **`PENDING` is the expected state for unfinished work.** A
  `planned` entry that fails to connect (DNS, refused, timeout)
  returns `PENDING`. This is the normal state for subdomains whose
  CF Pages project or Render service hasn't been provisioned yet;
  it is not a regression.
- **403 from Pages can be load-balancer noise.** The `play`,
  `cards`, and `ewiki` Pages projects all sit behind the same
  Cloudflare front layers as R2. A 403 from any of them follows the
  same three-layer diagnosis; the third branch points at the Pages
  project's access policies (Cloudflare Access) rather than R2.
- **`live` checkout drift.** When the worktree's copy of either
  script is newer than the canonical checkout's, run the worktree's
  script against the canonical checkout's `.env`
  (`node --env-file=.env <absolute-script-path>`) to exercise the
  full suite until the branch lands on `main`.
- **R2 CORS is a warning, not a failure.** The `Cloudflare R2 CORS`
  row records via `recordWarning()` rather than `recordResult(...,
  false, ...)` because today's SPA consumes card assets via `<img>`
  (which bypasses CORS). A missing R2 CORS policy will print a
  yellow `⚠` row and exit 0; promote it to a hard failure (change
  `recordWarning` → `recordResult(..., false, ...)`) once any code
  path `fetch()`es an R2-hosted asset from the browser.
- **`ewiki` Location is long.** The `ewiki` apex returns a 302 to
  Cloudflare Access with a multi-hundred-byte JWT in the query
  string. The script prints the full URL — that's the right
  default for diagnostics (the JWT is short-lived and reveals no
  secrets), but it dominates the output line. Don't conflate this
  with a probe failure; the verdict tag is `[OK]`. The
  `expectedLocation: "https://legendary-arena.cloudflareaccess.com/"`
  prefix in the manifest deliberately stops short of the JWT so
  every per-request token matches.
- **`expectedLocation` is opt-in per entry.** Most manifest rows do
  not declare `expectedLocation`, so the script's `Location` print
  is purely informational on those rows. Add `expectedLocation` to
  any entry whose correctness depends on *where* the redirect points
  (not just the status code). See
  [`docs/ops/DOMAINS.md §Adding a new subdomain`](../docs/ops/DOMAINS.md#adding-a-new-subdomain)
  for the schema.

## Code Touchpoints

- [`scripts/check-connections.mjs`](../scripts/check-connections.mjs) —
  ESM, self-contained except for the optional `pg` import resolved
  via `createRequire` from any workspace that declares it.
- [`scripts/check-subdomains.mjs`](../scripts/check-subdomains.mjs) —
  ESM, no external imports beyond Node built-ins; uses `fetch` with
  `redirect: 'manual'` and a 10 s `AbortSignal` timeout.
- [`package.json`](../package.json) — defines the `check`
  (`node --env-file=.env scripts/check-connections.mjs`),
  `check:domains` (`node scripts/check-subdomains.mjs`), and
  `check:incident` (chained run, `--live-only` for domains) pnpm
  aliases.
- [`apps/server/src/server.mjs`](../apps/server/src/server.mjs) —
  hosts the `/health` route and the `Server({ origins })` allowlist
  that the connection script's CORS probes target.
- [`apps/server/src/auth/hanko/hankoVerifier.logic.ts`](../apps/server/src/auth/hanko/hankoVerifier.logic.ts) —
  the production JWKS verifier whose URL resolution the
  `Hanko JWKS` check mirrors.

## Data Files

- [`docs/ops/domains.json`](../docs/ops/domains.json) — canonical
  manifest of every subdomain, declared `state`, expected status,
  and runbook anchor; the sole input to `check-subdomains.mjs`.
- [`docs/ops/DOMAINS.md`](../docs/ops/DOMAINS.md) — per-anchor
  human runbook; cited by the script on `FAIL` rows.
- [`.env`](../.env.example) — required environment variables;
  `.env.example` is the template kept in version control.

## References

- [`scripts/check-connections.mjs`](../scripts/check-connections.mjs)
- [`scripts/check-subdomains.mjs`](../scripts/check-subdomains.mjs)
- [`docs/ops/domains.json`](../docs/ops/domains.json)
- [`docs/ops/DOMAINS.md`](../docs/ops/DOMAINS.md)
- [`package.json`](../package.json) — `check` and `check:domains` aliases
- [`apps/server/src/server.mjs`](../apps/server/src/server.mjs) —
  `/health` route and CORS allowlist
- [`apps/server/src/auth/hanko/hankoVerifier.logic.ts`](../apps/server/src/auth/hanko/hankoVerifier.logic.ts) —
  Hanko JWKS verifier (WP-126 / D-12602)
- [PR #92 — auth-stack operational checks](https://github.com/barefootbetters/legendary-arena/pull/92) —
  origin of the four 2026-05-18 checks (`pnpm lockfile`,
  `Hanko tenant CORS`, `API server CORS`, `Arena-client bundle env`)
