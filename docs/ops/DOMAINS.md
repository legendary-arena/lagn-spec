# Domains & Subdomain Runbook

**Purpose:** Authoritative map of every `legendary-arena.com` subdomain — what
it serves, where it's hosted, what infra config depends on it, and what to do
when a probe fails.

The machine-readable companion is [`domains.json`](./domains.json). The smoke
test [`scripts/check-subdomains.mjs`](../../scripts/check-subdomains.mjs) reads
that file and probes each entry. On failure, it prints the anchor below
(e.g., `docs/ops/DOMAINS.md#api`) so the operator lands on the right section.

This document is operational, not architectural. It is **subordinate to**
`docs/ai/ARCHITECTURE.md` and the rules under `.claude/rules/`. It does not
define new architectural boundaries.

---

## Overview

| Subdomain | Purpose | Host | Source | State |
|---|---|---|---|---|
| `legendary-arena.com` (apex) | Redirect to `www.` | Cloudflare Pages (redirect) | redirect rule | planned |
| `www.legendary-arena.com` | Marketing site | Cloudflare Pages | `C:\www\legendary-arena-com` (Hugo) | planned |
| `play.legendary-arena.com` | Game client | Cloudflare Pages | [apps/arena-client](../../apps/arena-client) | planned |
| `cards.legendary-arena.com` | Registry viewer | Cloudflare Pages | [apps/registry-viewer](../../apps/registry-viewer) | planned (currently on `legendary-arena` Pages project) |
| `wiki.legendary-arena.com` | Public player wiki | Cloudflare Pages | TBD (separate Hugo site) | planned |
| `ewiki.legendary-arena.com` | Private engineering wiki | Render Static Site + Access | [apps/wiki-viewer](../../apps/wiki-viewer) (Hugo build of [docs/wiki](../wiki)) | live, gated |
| `legends.legendary-arena.com` | Public scoreboard (attract board) | Cloudflare Pages | `apps/legends-board` (planned — WP-143) | planned |
| `api.legendary-arena.com` | Game server REST + Socket.IO | Render (CNAME from Cloudflare) | [apps/server](../../apps/server) | planned |
| `legendary-arena-server.onrender.com` | API canonical hostname | Render | [apps/server](../../apps/server) | live |
| `images.barefootbetters.com` | Card image CDN | Cloudflare R2 | external | live |

`state` legend: `live` = deployed and probed for health; `planned` = not yet
deployed (still probed by default — see verdicts below). For Cloudflare
Access-gated entries, a redirect/401 is the *healthy* response.

**Probe verdicts** (printed by [`scripts/check-subdomains.mjs`](../../scripts/check-subdomains.mjs)):

| Verdict | Meaning | Action |
|---|---|---|
| `OK` | `live` entry returned the expected status | none |
| `PENDING` | `planned` entry's hostname doesn't resolve / connect — **expected**, not deployed yet | none until you deploy it |
| `READY` | `planned` entry returned the expected status — deploy is up | flip `state` to `"live"` in [domains.json](./domains.json) |
| `FAIL` | `live` entry broken, OR `planned` entry returned an unexpected status (misconfig) | follow the per-section runbook below |

The script exits 0 unless there is at least one `FAIL`. `--live-only` skips
all planned entries (useful in CI when you only care about prod health).

---

## Per-subdomain detail

### apex
**`legendary-arena.com`** — apex domain.

Decide direction once: apex → www, or www → apex. The conventional choice for
a Pages-hosted marketing site is apex → www, with the apex configured as a
Cloudflare redirect rule rather than a separate Pages project.

Healthy response: `301`, `302`, or `308` to `https://www.legendary-arena.com/`.

Depends on: nothing. No app config consumes the apex hostname.

### www
**`www.legendary-arena.com`** — Hugo marketing site.

- **Build:** `hugo --minify` from the marketing repo root
- **Output dir:** `public/`
- **Source:** external repo at `C:\www\legendary-arena-com` (not part of this monorepo)
- **Env:** none required for build

Healthy response: `200` with `text/html` body.

Depends on: nothing. Pure static content; no API calls from marketing pages.

### play
**`play.legendary-arena.com`** — game client SPA.

- **Build:** `pnpm install && pnpm -r build && pnpm --filter @legendary-arena/arena-client build`
- **Output dir:** `apps/arena-client/dist/`
- **Env:** `VITE_API_BASE_URL` (set to `https://api.legendary-arena.com` in Cloudflare Pages env vars)

Healthy response: `200` with the SPA shell.

Depends on:
- `api.legendary-arena.com` (Socket.IO transport, REST endpoints under `/api/*`)
- `images.barefootbetters.com` (card images)
- The server's CORS allowlist must include `https://play.legendary-arena.com`

### cards
**`cards.legendary-arena.com`** — registry viewer SPA.

- **Build:** `pnpm install && pnpm registry:build && pnpm --filter registry-viewer build`
- **Output dir:** `apps/registry-viewer/dist/`
- **Env:** none — viewer is fully static and embeds registry data at build time

Healthy response: `200` with the SPA shell.

Depends on:
- `images.barefootbetters.com` (card images)
- No API. Viewer does not call the game server.

**Migration note:** the existing Cloudflare Pages project named
`legendary-arena` currently serves this app. Migrating to `cards.` means:
remove the apex/`legendary-arena.com` custom domain from that project, attach
`cards.legendary-arena.com` instead, and re-run a deploy so the project's
canonical URL is correct.

### wiki
**`wiki.legendary-arena.com`** — public player help wiki.

- **Build:** `hugo --minify` (from wherever the public wiki source lives)
- **Output dir:** `public/`

Healthy response: `200`.

Depends on: nothing.

**Status:** content not yet authored. The Pages project should not be created
until there is something to deploy, otherwise the URL serves a 404 placeholder
that confuses anyone who clicks it.

### ewiki
**`ewiki.legendary-arena.com`** — private engineering wiki, gated. Live since 2026-05-08.

- **Source:** [docs/wiki](../wiki) markdown files
- **Renderer:** [apps/wiki-viewer](../../apps/wiki-viewer) — Hugo build, deployed as the Render Static Site `legendary-arena-wiki` (see [render.yaml](../../render.yaml))
- **Gate:** Cloudflare Zero Trust Access policy (Free tier, One-time PIN identity provider)
- **DNS posture:** **proxied (orange cloud)**, NOT DNS-only. Access can only intercept traffic that flows through Cloudflare's edge; DNS-only would route the client directly to Render's IP and bypass the gate. (This is the opposite of the `api.` posture — see that section for why `api.` uses DNS-only.)

**Healthy response (unauthenticated):** `302` to a `*.cloudflareaccess.com`
login URL, or `401`/`403`. **A `200` here is a failure** — it means the
Access policy is missing and the engineering wiki is publicly readable.

**Configure the Cloudflare Access policy before attaching the custom domain.**
If the custom domain is attached before the Access policy exists, there is a
window during which the eng wiki is on the public internet.

Configuration steps (completed 2026-05-08):
1. Verify Render auto-deployed the `legendary-arena-wiki` static-site service
   from `render.yaml` (probe its `*.onrender.com` URL — content should serve
   without a gate at this layer; the gate binds to the custom domain).
2. Activate the Cloudflare Zero Trust **Free** plan on the account. Without
   an active Zero Trust plan, no Access application can be created — the
   dashboard's "Add an Application" button is gated behind plan activation.
3. In Cloudflare Zero Trust → Access → Applications → Add an Application,
   pick the **Self-hosted** tile (NOT "Connect a private web application",
   which is the tunnel-based flow). Set Application domain to the full
   FQDN `ewiki.legendary-arena.com`, attach an Allow policy on the
   operator's email, accept all available identity providers (Email
   One-time PIN is built-in and sufficient).
4. In Render, attach `ewiki.legendary-arena.com` as a custom domain on the
   **`legendary-arena-wiki`** service (NOT `legendary-arena-server`). Copy
   that service's CNAME target.
5. In Cloudflare DNS for the `legendary-arena.com` zone, add CNAME `ewiki`
   → Render's wiki-service target, **proxied (orange cloud)**.
6. Verify Cloudflare TLS mode for the zone is `Full` or `Full (strict)`,
   not `Flexible` — required so Cloudflare's edge talks to Render over
   HTTPS.
7. From an incognito browser, visit `https://ewiki.legendary-arena.com`.
   Expect a redirect to `*.cloudflareaccess.com/cdn-cgi/access/...`. After
   email OTP, the wiki should render. **A 200 with content unauthenticated,
   or Render's plain-text "Not Found" 404, is a failure — see the failure
   runbook below.**

### legends
**`legends.legendary-arena.com`** — public, no-auth scoreboard ("Hall of Legends" attract board).

- **Source:** `apps/legends-board` (planned — WP-143)
- **Build:** Vite SPA, Cloudflare Pages
- **Data source:** R2 JSON snapshots written by the publisher in `apps/server/src/legends/` (planned — WP-142). The SPA does **not** hit `api.legendary-arena.com`.

Healthy response: `200` with the SPA shell.

Depends on:
- R2 snapshot bucket (public-read prefix `legends/v1/*`) populated by WP-142
- `images.barefootbetters.com` (hero/scheme art)

**Why R2 snapshots, not direct API:** decouples public scoreboard availability from game-server uptime, prevents anonymous traffic from hitting the prod Postgres, and gives Cloudflare's CDN something it can cache aggressively. A viral moment on the scoreboard must not become a game-server incident.

**Snapshot freshness is its own check** — the publisher writes a `legends/v1/manifest.json` with `generatedAt` and the SPA renders a "last updated" badge. A stale manifest is the signal that the publisher (not the SPA) is unhealthy. See WP-142.

### api
**`api.legendary-arena.com`** (live since 2026-05-09) and
**`legendary-arena-server.onrender.com`** (live, kept as canonical fallback) — game server.

- **Source:** [apps/server](../../apps/server)
- **Host:** Render web service `legendary-arena-server` (see [render.yaml](../../render.yaml))
- **Probe path:** `/health` (matches `healthCheckPath` in render.yaml)
- **Database:** Render managed Postgres `legendary-arena-db` (private; not internet-reachable)

**Healthy response:** `200` with a small JSON or text body from the health route.

Depends on (server-side runtime):
- Render Postgres `legendary-arena-db`
- Hanko tenant (`HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE` envs)
- Stripe billing config (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ALLOWLIST`, `PUBLIC_BASE_URL`) — note `PUBLIC_BASE_URL` is the **client** URL Stripe Checkout redirects users to after success/cancel (see [apps/server/src/billing/billing.routes.ts:339-340](../../apps/server/src/billing/billing.routes.ts)), not an API URL.

**`api.` cutover — completed 2026-05-09. The full procedure was:**
1. Add Cloudflare CNAME `api` → `legendary-arena-server.onrender.com` in the `legendary-arena.com` zone, **DNS only (gray cloud)**. Cloudflare proxying breaks Render's Let's Encrypt cert provisioning and disrupts long-lived Socket.IO connections on the Free tier.
2. Add `api.legendary-arena.com` as a custom domain in Render's dashboard. Leave "Render Subdomain" enabled so the onrender.com URL keeps working in parallel.
3. Wait for Render to issue the Let's Encrypt cert (1-5 minutes typical).
4. Verify with `pnpm check:domains` — entry reports `READY`, then flip `state` to `"live"` in [domains.json](./domains.json).

**Updates that are NOT part of the `api.` cutover** (despite being on a previous draft of this runbook — that was wrong):

- **`PUBLIC_BASE_URL`** points at the **client**, not the API. It controls Stripe Checkout success/cancel redirects, which need to land on a page the user can see — i.e., the future `play.legendary-arena.com` (or `app.` per the original WP-133 plan; `.env.example` and the test fixtures still say `app.`). Update this when `play.` is deployed, not when `api.` is renamed.
- **Stripe webhook endpoint URL** points at the API and CAN be updated to `https://api.legendary-arena.com/<webhook-path>` now. It's optional — both hostnames serve the same routes during the dual-running window. Prefer the friendly hostname for any new webhook configs.
- **Hanko allowed origins / audience** — only matters when a client at a new origin calls Hanko. Update when adding new client origins (e.g., `play.`), not when the API hostname changes.
- **Server CORS allowlist** — update when adding new client origins, same reason.
- **arena-client's `VITE_API_BASE_URL`** — there is no arena-client deploy yet, so nothing to update.

### images
**`images.barefootbetters.com`** — card image CDN.

- **Host:** Cloudflare R2 with public bucket binding
- **Source:** external (BarefootBetters)
- **Probe:** root URL — bucket index returns `403` or `404`; specific image
  keys return `200`. The probe verifies DNS/TLS, not bucket contents.

Per [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md): "Card images hosted at:
`https://images.barefootbetters.com/`. Image URLs use hyphens, not underscores."

---

## Cutover order of operations

The deployment migration itself is **not** a runbook entry — it's
WP-worthy because it modifies shipped infrastructure config (server CORS,
`PUBLIC_BASE_URL`, Hanko allowed origins, Stripe redirect URLs). Track that
in a future `WP-NNN: production cutover to legendary-arena.com` work packet.
The runbook's job is to verify the result, not to drive the cutover.

Suggested sequence (for WP scoping):

1. **Cloudflare DNS authority.** Move `legendary-arena.com` to Cloudflare
   nameservers if not already. Verify with `Resolve-DnsName legendary-arena.com -Type SOA`.
2. **`api.` first.** CNAME (DNS only) + Render custom domain attachment. Done
   2026-05-09. **Note:** the PUBLIC_BASE_URL / Hanko origins / Stripe webhook /
   server-CORS updates listed under this step in earlier runbook drafts do NOT
   belong here — they are coupled to *which client URL* the system points at,
   not to the API hostname rename. They land with the `play.` deploy (step 5).
3. **`cards.` migration.** Detach `cards.barefootbetters.com` from the existing
   `legendary-arena` Pages project (or keep with redirect during transition).
   Attach `cards.legendary-arena.com` to the same project. Smoke-test.
4. **`www.` and apex.** New Pages project for the Hugo marketing repo. Apex
   redirect rule (apex → www, or vice versa — pick one).
5. **`play.` Pages project.** New project for `apps/arena-client`. **At this
   step**, update on Render: `PUBLIC_BASE_URL` → `https://play.legendary-arena.com`,
   Hanko allowed origins to include `play.`, Stripe webhook redirect allowlist,
   and server CORS allowlist. Verify end-to-end before announcing.
6. **`wiki.`** when the public Hugo wiki has content to serve.
7. **`ewiki.`** Done 2026-05-08. Configured Cloudflare Access (Zero Trust
   Free plan, Email One-time PIN, Allow policy on operator email) before
   attaching the custom domain on the `legendary-arena-wiki` service. DNS
   record proxied (orange cloud) so Cloudflare's edge can intercept.

---

## Failure runbook

**`apex` returns 200 instead of a redirect.** The Cloudflare redirect rule is
missing or pointing the wrong way. Re-create the rule under the zone's "Bulk
Redirects" or a Page Rule, source `legendary-arena.com/*`, target
`https://www.legendary-arena.com/$1`, status `301`.

**`www`, `play`, `cards`, `wiki` return 404.** The Pages project has no
production deployment for the attached custom domain, or the custom domain
attachment is on the wrong project. In Cloudflare Pages: confirm the project,
confirm the latest production deployment is green, confirm the custom domain
is attached to that project (not a different one).

**`ewiki` returns 200 unauthenticated.** Cloudflare Access policy is missing
or disabled. **Treat as a security incident** until corrected. Add an
Access application for the hostname and re-probe before continuing.

**`ewiki` reaches Render directly without a Cloudflare Access redirect**
(probe response includes `x-render-origin-server: Render` and `Server:
cloudflare`, but no Access intercept). Either (a) the Cloudflare DNS
record is set to "DNS only" (gray cloud) — flip to proxied (orange cloud)
so Cloudflare's edge sees the traffic; or (b) the Access application's
domain doesn't match `ewiki.legendary-arena.com` exactly; or (c) the
Cloudflare Zero Trust plan is not active on the account (no Access app
can be created without an active plan, even Free). Fix the misconfigured
piece and re-probe.

**`ewiki` shows the Cloudflare Access login redirect, but after auth
returns plain "Not Found" with `x-render-origin-server: Render`.** The
gate works; the Render binding is wrong. The custom domain
`ewiki.legendary-arena.com` is either unattached or attached to the wrong
Render service (typically `legendary-arena-server` instead of
`legendary-arena-wiki`). In Render, detach from the wrong service and
re-attach to `legendary-arena-wiki`, then re-probe.

**`api.legendary-arena.com/health` returns DNS error.** CNAME hasn't been
created yet, or hasn't propagated. Check Cloudflare DNS for the `api` record.
The onrender.com canonical hostname should still be healthy — that confirms
the server itself is up and the issue is only the CNAME.

**`api` returns `502`/`503`.** Render service is down or restarting. Check
the Render dashboard for the `legendary-arena-server` service. Check
`legendary-arena-db` Postgres status — a DB outage will surface as 5xx on
health checks that touch the DB. See [`docs/ops/INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).

**`api` returns CORS error in browser but `/health` is 200 from curl.** The
new client origin is not in the server's CORS allowlist. Update the server
config and redeploy.

**`images.barefootbetters.com` returns DNS error.** Card images will be
broken in `play` and `cards` until restored. This is upstream of this repo;
escalate to the BarefootBetters image-bucket owner.

---

## Adding a new subdomain

1. Add an entry to [`domains.json`](./domains.json) with all required fields:
   `name`, `url`, `host`, `source`, `expectedStatus`, `state`, `anchor`. Add
   `notes` if anything is non-obvious.
2. Add a section to this file with the matching anchor (lowercase, hyphenated).
3. If the new subdomain is consumed by `apps/server` (e.g., a new client
   origin), add it to the server's CORS allowlist in the same change.
4. If the new subdomain depends on the API, document it under the new
   section's "Depends on:" list.
5. Run `pnpm check:domains` to confirm the script parses the manifest and
   reports `PENDING` (DNS not yet resolving) for the new entry.
6. Once the deploy is up, the next probe should report `READY`. Flip
   `state` to `"live"` in [domains.json](./domains.json) — the next probe
   will then report `OK` and any future regression is treated as `FAIL`.

---

## Related documents

- [`docs/08-DEPLOYMENT.md`](../08-DEPLOYMENT.md) — high-level deployment overview
- [`docs/ops/DEPLOYMENT_FLOW.md`](./DEPLOYMENT_FLOW.md) — environments and promotion
- [`docs/ops/INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md) — incident handling
- [`render.yaml`](../../render.yaml) — Render service + database config
- [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) — image CDN and tech-stack invariants
