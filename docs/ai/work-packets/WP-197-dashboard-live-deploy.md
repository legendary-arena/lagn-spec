# WP-197 — Dashboard Live Deploy (Cloudflare Pages + Access Gate)

**Status:** Draft
**Primary Layer:** Server / Infra (no `apps/server` code change; CF Pages + Cloudflare Access configuration + `docs/ops/` governance)
**Dependencies:** WP-157 (Dashboard Scaffold) — Done 2026-05-16; WP-162 (UI Polish) — Done 2026-05-21
**EC:** EC-223 (`docs/ai/execution-checklists/EC-223-dashboard-live-deploy.checklist.md`)
**Baseline:** `origin/main` at time of execution

---

## Goal

After this packet, `https://dashboard.legendary-arena.com` resolves to
the `apps/dashboard` SPA shell hosted on Cloudflare Pages, gated by a
Cloudflare Access Self-hosted Application (Email One-time PIN; allow
policy on the operator email). The deploy ships in **mock mode**
(`VITE_USE_MOCKS=true` in the CF Pages Production env scope) so every
widget renders its existing four-state shell against the in-bundle
mock data; no real backend wiring is added by this WP. The
[`docs/ops/domains.json`](../../ops/domains.json) manifest gains a
`dashboard` row and its `state` flips from `planned` to `live` after
`pnpm check:domains` reports `READY`. The [`docs/ops/DOMAINS.md`](../../ops/DOMAINS.md)
row at line 31 is updated in lock-step (state `planned` → `live`, notes
updated with the live-since date + CF Access posture statement).

The result is an operator-reachable dashboard shell — useful for
design review, live-data wiring previews, and demoing the existing
WP-157 / WP-162 / (when executed) WP-196 widget surfaces from any
device — without exposing the in-app mock login (which accepts any
email) to the public internet.

---

## Assumes

- WP-157 scaffold + WP-162 polish are live on `main` and
  `pnpm dash:build` produces `apps/dashboard/dist/` cleanly.
- `apps/dashboard/.env.example` lists `VITE_USE_MOCKS=true` and
  `VITE_API_BASE_URL` (the latter unused while mocks are on but
  kept for future real-data wiring).
- `docs/ops/DOMAINS.md` already contains a `dashboard` row at line 31
  with state `planned` (verified 2026-06-01 against `origin/main`).
- `docs/ops/domains.json` does **not** yet contain a `dashboard`
  entry — this WP introduces it. Verified by
  `Select-String -Path docs\ops\domains.json -Pattern '"dashboard'`
  returning zero matches as of `origin/main`.
- Cloudflare Zero Trust Free plan is active on the
  `legendary-arena.com` account. Activated 2026-05-08 under the
  `ewiki.` deploy (DOMAINS.md §ewiki step 2). If the plan was
  deactivated since then, the operator must re-activate it before
  Step C of this packet can run — the "Add an Application" button
  in Cloudflare Zero Trust is gated behind plan activation.
- `pnpm check:domains` exists and reads `docs/ops/domains.json`; a
  new `state: "planned"` entry produces a `PENDING` verdict before
  deploy and a `READY` verdict once the deploy resolves with the
  expected status.
- No other dashboard WP is in progress (one-packet-per-session rule).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — the
  dashboard is the operator surface of the Server layer's wiring;
  no engine, registry, or pre-planning logic crosses into it.
- `.claude/rules/architecture.md` — Layer Boundary; Dependency
  Direction.
- `.claude/rules/code-style.md` — Rule 6 (`// why:` comments),
  Rule 11 (full-sentence error messages).
- `docs/ops/DOMAINS.md` — read the **entire file**, especially:
  - §ewiki (lines 154–199) — the direct precedent for a
    Cloudflare-Access-gated Render-or-Pages deploy with proxied DNS.
    The dashboard deploy mirrors this pattern with CF Pages as the
    origin instead of Render.
  - §dashboard (line 31 in the overview table) — the row this WP
    flips from `planned` to `live`.
  - §"Adding a new subdomain" — the manifest-entry + runbook-entry
    discipline this WP must satisfy.
  - §"Failure runbook" — the `ewiki` failure modes are the closest
    analog to dashboard failure modes since both are Access-gated.
- `docs/ops/domains.json` — read end-to-end to confirm the entry
  shape (`name`, `url`, `host`, `source`, `expectedStatus`,
  `expectedLocation`, `state`, `anchor`, `notes`).
- `docs/ops/DASHBOARD-REQUIREMENTS.md §1 (What the Dashboard Is)`
  — confirms the dashboard is an internal operator tool, not a
  public surface; informs the Access gate decision.
- `docs/ai/work-packets/WP-157-dashboard-scaffold.md` — Widget
  Contract + build target.
- `docs/ai/DECISIONS.md` — scan for D-157xx (scaffold) and any
  D-15xx entries that constrain the auth posture; nothing here may
  contradict prior locked decisions.
- `apps/dashboard/vite.config.ts` — confirms the build output dir
  (`dist/`) and the `__GIT_SHA__` / `__BUILD_TIMESTAMP__` /
  `__APP_VERSION__` constants emitted at build time.
- `apps/dashboard/.env.example` — env var contract.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file (no diffs, no
  snippets, no "show only the changed section")
- pnpm workspace commands only
- Full-sentence error messages

**Packet-specific:**
- **CANONICAL RULE — Gate-before-expose.** The system MUST be
  protected by Cloudflare Access BEFORE any public DNS attach.
  Sub-task C strictly precedes Sub-task D in §Scope (In). This
  rule is reusable across future Access-gated WPs; violations are
  classified as security incidents (SEV-0 if a pre-auth `200` is
  observed), not deploy bugs. Source: the `ewiki.` precedent
  (DOMAINS.md §ewiki) made the same trade-off explicit; this WP
  promotes it to a canonical rule applicable to any future
  Access-gated subdomain.
- **Single-operator authority.** MUST NOT configure Cloudflare
  Access allow rules for any identity other than
  `jeff@barefootbetters.com`. The single-operator posture is
  intentional during pre-launch to keep the attack surface
  minimal; expanding the allow list is a one-line Access edit but
  requires a separate WP (see §Out of Scope).
- MUST NOT modify any file under `apps/dashboard/src/**` — this WP
  is deploy + governance only. UI changes ride a separate WP.
- MUST NOT modify any file under `apps/server/src/**` — no CORS
  allowlist edit, no new endpoint. The dashboard does not call
  `api.legendary-arena.com` while `VITE_USE_MOCKS=true` is set.
- MUST NOT create the Cloudflare Pages project or attach the
  custom domain without the Cloudflare Access policy already in
  place. The `ewiki.` precedent (DOMAINS.md §ewiki) warns: "If the
  custom domain is attached before the Access policy exists, there
  is a window during which the [surface] is on the public internet."
  The dashboard has the same exposure risk because its in-app
  login is a mock that accepts any email.
- MUST set `VITE_USE_MOCKS=true` in the CF Pages Production env
  scope before the first production deploy. A production deploy
  without this env var will attempt to call `VITE_API_BASE_URL`
  (default `http://localhost:3001/api/dash`) and every widget will
  render its `error` state.
- MUST attach the dashboard's custom domain to the `dashboard-only`
  CF Pages project, never to the `legendary-arena-play` (game
  client) or `legendary-arena-website` (marketing) projects.
- MUST flip `state` in `docs/ops/domains.json` from `planned` to
  `live` **only after** `pnpm check:domains` reports `READY` for
  the `dashboard` entry. Flipping earlier turns a future
  pre-deploy `PENDING` into a misleading `FAIL`.
- MUST NOT proxy the CF Pages origin DNS through Cloudflare with
  the "DNS only" gray-cloud setting. Cloudflare Access can only
  intercept traffic that flows through Cloudflare's edge, and CF
  Pages requires the proxied posture by default — this is the same
  reason the `ewiki.` deploy uses proxied (orange-cloud) DNS while
  `api.` uses DNS-only. Document the choice in the `notes` field
  of the `domains.json` row.

**Session protocol:**
- If the Cloudflare Zero Trust plan is inactive at execution time,
  STOP and ask. Do not attempt to create the Access application
  without it; the Cloudflare dashboard's "Add an Application"
  button is gated behind plan activation and will silently produce
  no Access intercept.
- If the operator wants real-data wiring rather than mock-mode for
  the first production deploy, STOP. That requires WP-B of the
  pre-mortem grouping (acquisition / funnel + first server
  endpoint for dashboard) to land first, and is governed by a
  separate WP per the one-packet-per-session rule.

**Locked contract values:**

| Item | Value |
|---|---|
| Subdomain | `dashboard.legendary-arena.com` |
| CF Pages project name | `legendary-arena-dashboard` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/dashboard..." build` |
| Output directory | `apps/dashboard/dist` |
| Production env vars | `VITE_USE_MOCKS=true`, `NODE_VERSION=22` |
| DNS posture | Proxied (orange cloud) — required for Cloudflare Access intercept |
| Cloudflare Access tile | Self-hosted (NOT "Connect a private web application") |
| Cloudflare Access identity provider | Email One-time PIN (built-in) |
| Cloudflare Access allow policy | Single operator email (`jeff@barefootbetters.com`) |
| Expected status (probe) | `302` to `*.cloudflareaccess.com`, or `401` / `403` (A `200` here is a FAIL — Access misconfigured) |
| `expectedLocation` prefix | `https://legendary-arena.cloudflareaccess.com/` |
| Anchor in DOMAINS.md | `dashboard` |

---

## Scope (In)

### A) `docs/ops/domains.json` — add the `dashboard` row

Insert a new entry **adjacent to the existing `legends` entry** so
the planned-but-not-yet-live family sits together visually. Initial
state is `"planned"` (per the §"Adding a new subdomain" workflow);
the `state` flip to `"live"` happens in Sub-task E below, after
deploy verification.

The new entry must contain the following fields (exact spellings):

```json
{
  "name": "Internal admin dashboard",
  "url": "https://dashboard.legendary-arena.com",
  "host": "Cloudflare Pages + Cloudflare Access",
  "source": "apps/dashboard",
  "expectedStatus": [302, 401, 403],
  "expectedLocation": "https://legendary-arena.cloudflareaccess.com/",
  "state": "planned",
  "anchor": "dashboard",
  "notes": "Cloudflare Access redirects unauthenticated probes to login (302) or rejects them (401/403). A 200 here means the gate is misconfigured and the dashboard is publicly readable. expectedLocation is a prefix; the Access login URL appends a long JWT in the query string that varies per request. Ships in mock mode (VITE_USE_MOCKS=true on CF Pages Production scope); real-data wiring is a separate WP."
}
```

### B) Cloudflare Pages project creation (operator action)

In Cloudflare Pages dashboard:

1. Create new project `legendary-arena-dashboard`, linked to the
   `legendary-arena` GitHub repository.
2. Production branch: `main`.
3. Build command (verbatim, including the trailing `...` topology
   selector — locked under WP-144 / D-14401 because the
   single-package filter does not build workspace deps and
   `packages/game-engine/dist/` is gitignored):
   `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/dashboard..." build`
4. Build output directory: `apps/dashboard/dist`.
5. Environment variables (Production scope only):
   - `VITE_USE_MOCKS = true`
   - `NODE_VERSION = 22`
6. Trigger the first production build; confirm it completes.
   Project will be reachable at `legendary-arena-dashboard.pages.dev`
   at this point — **do not attach the custom domain yet** (Sub-task D).

### C) Cloudflare Access application (operator action — must precede Sub-task D)

In Cloudflare Zero Trust → Access → Applications → Add an Application:

1. Pick the **Self-hosted** tile (NOT "Connect a private web
   application", which is the tunnel-based flow per DOMAINS.md
   §ewiki step 3).
2. Application domain: `dashboard.legendary-arena.com` (full FQDN).
3. Identity providers: accept the default Email One-time PIN
   (built-in and sufficient; matches `ewiki.` precedent).
4. Allow policy: single rule, Include: `Emails` = `jeff@barefootbetters.com`.
   No group, no service-token, no bypass policy.
5. Save the application. Do not yet point DNS at the CF Pages
   project — Sub-task D is the DNS step.

### D) Custom domain attachment + DNS (operator action — runs AFTER Sub-task C)

1. In Cloudflare Pages → `legendary-arena-dashboard` → Custom
   domains → Set up a custom domain: `dashboard.legendary-arena.com`.
2. Cloudflare will offer to create the DNS record automatically.
   Accept; verify the record is `CNAME dashboard → legendary-arena-dashboard.pages.dev`
   and is **proxied (orange cloud)**. If gray-cloud is the default,
   manually flip it to orange. (See `## Non-Negotiable Constraints`
   for the DNS-posture rule.)
3. Verify Cloudflare TLS mode for the `legendary-arena.com` zone
   is `Full` or `Full (strict)`, not `Flexible`.

### E) Post-deploy verification + `domains.json` state flip

The probe lifecycle is a deterministic three-state contract — treat
it as a state machine; out-of-order transitions are FAIL. EC-223
§Probe Lifecycle is the authoritative execution spec; the table
below is the design statement.

| Step | When | `pnpm check:domains` verdict |
|---|---|---|
| 1 | Sub-task A landed; B/C/D not yet — `state: "planned"`, DNS not resolving at CF Pages | `PENDING` (expected for a `planned` entry) |
| 2 | Sub-tasks B + C + D landed — DNS + Pages + Access all wired; `state` still `"planned"` | `READY` (probe returned `302`/`401`/`403` and the `expectedLocation` prefix matched) |
| 3 | Sub-task E flipped `state` from `"planned"` to `"live"` | `OK` |

Rules:

- `READY` MUST occur BEFORE the `state` flip. Flipping on
  `PENDING` corrupts the lifecycle (future pre-deploy `PENDING`s
  read as misleading `FAIL`s).
- `OK` MUST occur AFTER the flip; `OK` before the flip is
  impossible by construction.
- Any out-of-order verdict (`FAIL` after `READY`, `PENDING` after
  `OK`, `READY` not reached after D) → STOP, revert `state` to the
  prior value, re-probe, triage per §Known Failure Modes before
  retrying.

The `state` flip from `"planned"` to `"live"` lands in a single
commit alongside the §F DOMAINS.md row update.

### F) `docs/ops/DOMAINS.md` row update

Update the existing `dashboard.legendary-arena.com` row at line 31:

- `state` column: `planned` → `live`
- Add to the row's notes (or to an inline section below the
  overview table if the section grows beyond the table cell):
  - Live since `YYYY-MM-DD` (the date of the `state` flip).
  - CF Pages project name (`legendary-arena-dashboard`).
  - Cloudflare Access posture (Self-hosted, Email OTP, single-
    operator allow policy).
  - Ships in mock mode; real-data wiring is a separate WP.

If a per-section `### dashboard` block does not yet exist under
§"Per-subdomain detail", add one mirroring the §ewiki structure
(Source / Renderer / Gate / DNS posture / Healthy response /
Configuration steps).

### G) Decisions

Two D-entries appended to `docs/ai/DECISIONS.md`:

- **D-19701** — Dashboard deploy posture is Cloudflare Pages + Cloudflare
  Access (Email OTP), mirroring the `ewiki.` precedent rather than
  the `play.` precedent (public, no gate). Rationale: the in-app
  mock login (`apps/dashboard/src/pages/auth/LoginPage.vue:70`)
  accepts any email and any role, so a publicly-reachable mock
  deploy would expose every operator route to any visitor. The
  Access gate restores the security model the mock login removes
  during development.

- **D-19702** — Initial production deploy ships in mock mode
  (`VITE_USE_MOCKS=true` on CF Pages Production env scope). Real-
  data wiring is deferred to a separate WP (the
  pre-mortem-grouping WP-B / WP-C / WP-D / WP-E or their
  successors) because each widget's data source is its own
  contract (Stripe webhook stream, `analytics_events` table that
  does not yet exist, cohort-materialization batch job, public-
  surface ping). Conflating real-data wiring into the deploy WP
  would expand scope past one-packet-per-session.

### H) Governance index updates

- `docs/ai/work-packets/WORK_INDEX.md` — add WP-197 row in the
  Phase 8+ (dashboard) section. **Deferred to a follow-up SPEC
  commit** if `WP-195` is executing in parallel and may touch
  `WORK_INDEX.md` in its own session — the parallel-edit risk is
  documented in `.claude/rules/work-packets.md §Conventions Are
  Locked`. The WP file may be committed before WORK_INDEX
  registration; WP-196 followed this same pattern (drafted
  2026-05-31, WORK_INDEX row pending).
- `docs/ai/STATUS.md` — note dashboard now reachable behind
  Cloudflare Access at `https://dashboard.legendary-arena.com`.

---

## Out of Scope

- `apps/dashboard/src/**` — no UI changes. The shell that ships is
  whatever is on `main` at deploy time (WP-157 scaffold + WP-162
  polish + whichever later WPs have landed).
- `apps/server/src/**` — no CORS allowlist edit. The dashboard
  does not call `api.legendary-arena.com` while mocks are on. A
  CORS edit lands with the real-data wiring WP (separate).
- WP-196 widget implementation (NetRevenueChartWidget +
  PaidActionErrorsWidget) — those are independent client-only
  widgets that ride a separate WP and may land before or after
  this one without ordering constraint.
- Real-data widget wiring of any kind — see D-19702.
- A second operator allow rule (additional team members) — single-
  operator allow policy ships; expanding the allow list is a one-
  line Cloudflare Access edit and does not warrant a WP.
- Replacing the in-app mock login with a real-auth flow — separate
  WP, depends on the auth-provider chain (Hanko) being wired into
  the dashboard the same way it is wired into `apps/arena-client`.
  Until then, the Access gate is the perimeter.
- Render-hosted alternative deploy (mirroring the `ewiki.` choice
  of Render Static Site) — the existing dashboard build is a Vite
  SPA already deploying cleanly to CF Pages-style hosts; Render
  offers no advantage here. Decision implicit in the locked CF
  Pages project name.
- Custom domain alias from the apex (`/dashboard` path on the apex
  redirect target) — no, the subdomain is canonical and easier to
  Access-gate independently of the apex.
- `pnpm-lock.yaml` modification — no new npm dependencies.
- The marketing-site Hugo bundle (`C:\www\legendary-arena-com`) —
  untouched.

---

## Files Expected to Change

- `docs/ops/domains.json` — **modified** — add new `dashboard`
  entry (initially `state: "planned"`; flipped to `state: "live"`
  in Sub-task E after `READY` verdict)
- `docs/ops/DOMAINS.md` — **modified** — overview-table row state
  flip + (if missing) new `### dashboard` section mirroring §ewiki
- `docs/ai/DECISIONS.md` — **modified** — append D-19701 and D-19702
- `docs/ai/STATUS.md` — **modified** — note dashboard reachable
  behind Access
- `docs/ai/work-packets/WP-197-dashboard-live-deploy.md` — **new** —
  this file
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — add WP-197
  row (deferred to follow-up SPEC commit if WP-195 is mid-execution
  and racing the index — see Scope §H)

No other files may be modified. Operator actions (Cloudflare Pages
project creation, Cloudflare Access application creation, custom
domain attachment, DNS proxy posture, env var entry) happen in the
Cloudflare dashboard and produce no repo diff.

---

## Acceptance Criteria

### A) `domains.json` entry shape
- [ ] `docs/ops/domains.json` contains exactly one entry with
      `"anchor": "dashboard"`.
- [ ] That entry's `url` is exactly `"https://dashboard.legendary-arena.com"`.
- [ ] That entry's `expectedStatus` is exactly `[302, 401, 403]`
      (array — closed three-value set matching the `ewiki` row).
- [ ] That entry's `expectedLocation` is exactly
      `"https://legendary-arena.cloudflareaccess.com/"`.
- [ ] That entry's `state` is `"live"` (at WP completion, after
      Sub-task E flip).
- [ ] That entry's `source` is exactly `"apps/dashboard"`.

### B) `DOMAINS.md` row update
- [ ] Overview-table `dashboard` row's State column reads `live`
      (not `planned`).
- [ ] Row's notes (or new per-section block) record the live-since
      date, CF Pages project name, Access posture, and the mock-mode
      statement.

### C) Deploy verification
- [ ] `pnpm check:domains` returns `OK` for the `dashboard` entry
      (was `PENDING` pre-deploy, `READY` after deploy, `OK` after
      `state` flip).
- [ ] An unauthenticated `curl -I https://dashboard.legendary-arena.com`
      returns `302` with `Location` starting `https://legendary-arena.cloudflareaccess.com/`.
- [ ] An authenticated browser session (post-OTP) loads the
      dashboard SPA shell and the `/login` page renders.
- [ ] The login page accepts any email + role (mock posture
      unchanged); selecting `admin` and submitting routes to
      `/overview` and the Overview page renders the existing
      WP-157 / WP-162 widgets.
- [ ] Every widget on `/overview` displays its `MOCK` freshness
      badge (confirms `VITE_USE_MOCKS=true` is in effect on the
      production build).
- [ ] The production build's `__GIT_SHA__` (visible in the
      `VersionBadge` component per WP-157) matches the commit
      that triggered the CF Pages build.

### D) Scope enforcement
- [ ] No file under `apps/dashboard/src/**` is modified by this WP
      (`git diff --name-only -- apps/dashboard/src/`).
- [ ] No file under `apps/server/src/**` is modified by this WP
      (`git diff --name-only -- apps/server/src/`).
- [ ] `pnpm-lock.yaml` byte-identical to `HEAD` at draft baseline
      (`git diff --stat pnpm-lock.yaml` empty).
- [ ] No file outside `## Files Expected to Change` was modified.

### Governance
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` contains D-19701 and D-19702 with
      rationale.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` contains a WP-197 row
      (or a follow-up SPEC commit is scheduled to add it once
      WP-195 lands its own WORK_INDEX edit).

---

## Verification Steps

```pwsh
# Step 1 — confirm no UI / server code change
git diff --name-only origin/main -- apps/dashboard/src/ apps/server/src/
# Expected: no output

# Step 2 — confirm pnpm-lock.yaml unchanged
git diff --stat pnpm-lock.yaml
# Expected: no output

# Step 3 — confirm domains.json contains exactly one dashboard entry
Select-String -Path docs\ops\domains.json -Pattern '"anchor": "dashboard"'
# Expected: exactly 1 match

# Step 4 — confirm the dashboard entry's expectedLocation is the
# Cloudflare Access login URL prefix
$json = Get-Content docs\ops\domains.json -Raw | ConvertFrom-Json
($json.domains | Where-Object { $_.anchor -eq 'dashboard' }).expectedLocation
# Expected: https://legendary-arena.cloudflareaccess.com/

# Step 5 — confirm the dashboard entry's state is "live"
($json.domains | Where-Object { $_.anchor -eq 'dashboard' }).state
# Expected: live

# Step 6 — run the domain probe
pnpm check:domains
# Expected: dashboard entry reports OK (after state flip)

# Step 7 (deploy-side, post-CF Pages build) — unauthenticated probe
# redirects to Cloudflare Access
curl -I https://dashboard.legendary-arena.com
# Expected: HTTP/302; Location: https://legendary-arena.cloudflareaccess.com/...

# Step 8 (manual, browser) — authenticate via Email OTP,
# confirm Overview renders mock widgets with MOCK freshness badges,
# confirm VersionBadge shows the expected git SHA.

# Step 9 — confirm no file outside scope was modified
git status --porcelain
# Expected: only the files listed in ## Files Expected to Change
```

---

## Vision Alignment

**Vision clauses touched:** `§13 Live Ops` (this WP makes the
operator dashboard reachable in live ops; the dashboard's purpose
per `docs/ops/DASHBOARD-REQUIREMENTS.md §1` is to support the
"is the system healthy / are players having a good experience /
is the business sustainable" daily cadence).

**Conflict assertion:** No conflict. This WP preserves all touched
clauses. The dashboard's role as an internal operator tool is
unchanged; this WP only makes it reachable from outside the
operator's local machine, behind Cloudflare Access.

**Non-Goal proximity check (NG-1..NG-7):** None crossed. No
player-facing surface, no monetization mechanic, no persuasive
copy, no leaderboard claim. The Access gate restricts access to a
single operator email.

**Determinism preservation:** N/A — no engine, RNG, replay, or
simulation code touched.

---

## Funding Surface Gate

**N/A.** Justification per §20.1: this WP touches no global
navigation funding affordance, no registry-viewer funding affordance,
no profile / account funding-attribution surface, no tournament
funding channel integration, and no user-visible funding copy as
part of a proposed or implemented user interaction. The dashboard
ships in mock mode behind Access; the only user is the operator.
Authority chain for §20: `WP-097`, `D-9701`, `D-9801` (cited; not
triggered).

---

## API Catalog (§21)

**N/A.** Justification: this WP does not add, modify, remove, or
change the status of any HTTP endpoint in `apps/server`, nor of any
`apps/server/src/**` library function recorded in
`docs/ai/REFERENCE/api-endpoints.md` as `Library-only`. The
dashboard runs in mock mode and makes no HTTP calls to
`api.legendary-arena.com` while `VITE_USE_MOCKS=true`. The
real-data wiring WP (separate, per D-19702) will trigger §21 when
it lands its first server endpoint.

---

## Locked Contract Values

| Item | Value | Decision |
|---|---|---|
| Subdomain | `dashboard.legendary-arena.com` | D-19701 |
| Deploy host | Cloudflare Pages (project `legendary-arena-dashboard`) | D-19701 |
| Auth gate | Cloudflare Access Self-hosted Application, Email One-time PIN, single-operator allow policy | D-19701 |
| DNS posture | Proxied (orange cloud) — required for Access intercept | D-19701 |
| Initial production data mode | Mock (`VITE_USE_MOCKS=true` on CF Pages Production env) | D-19702 |
| Real-data wiring posture | Deferred to separate WP | D-19702 |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/dashboard..." build` | (Inherits WP-144 / D-14401 build-command discipline) |
| Output directory | `apps/dashboard/dist` | (WP-157 scaffold) |

---

## Definition of Done

1. All Acceptance Criteria pass.
2. `pnpm check:domains` returns `OK` for the `dashboard` entry.
3. `docs/ops/domains.json` contains the `dashboard` row with
   `state: "live"` and the locked field shapes.
4. `docs/ops/DOMAINS.md` row reflects `live` state with notes.
5. `docs/ai/DECISIONS.md` records D-19701 and D-19702 with rationale.
6. `docs/ai/STATUS.md` notes dashboard now reachable behind
   Cloudflare Access.
7. `docs/ai/work-packets/WORK_INDEX.md` has WP-197 row (or a
   follow-up SPEC commit is scheduled to add it once WP-195 lands
   its own WORK_INDEX edit).
8. Unauthenticated `curl` to `https://dashboard.legendary-arena.com`
   returns `302` to `*.cloudflareaccess.com`.
9. Authenticated browser session loads the SPA shell and renders
   Overview with MOCK widgets.
10. No file outside `## Files Expected to Change` is modified.

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-19701 | Dashboard deploy posture is Cloudflare Pages + Cloudflare Access (Self-hosted, Email OTP, single-operator allow), mirroring the `ewiki.` precedent. | The in-app login (`apps/dashboard/src/pages/auth/LoginPage.vue`) is a mock that accepts any email and lets the user pick any role. A publicly-reachable mock deploy would expose every operator route to any visitor. The Access gate restores the security model the mock login removes during development. CF Pages (rather than Render) is the deploy host because the existing dashboard build is already a Vite SPA targeting that shape — no advantage to Render here. |
| D-19702 | Initial production deploy ships in mock mode (`VITE_USE_MOCKS=true` on the CF Pages Production env scope). Real-data wiring is deferred to a separate WP. | Each widget's data source is its own contract (Stripe webhook stream for net revenue, `analytics_events` table that does not yet exist for acquisition, cohort-materialization batch job for retention, public-surface ping for system health). Conflating real-data wiring into the deploy WP would expand scope past one-packet-per-session. Mock-mode in production is useful in its own right — design review from any device, demoing the operator surface to stakeholders, validating the deploy pipeline before real data has stakes. |

---

## Future Work (Explicitly Deferred)

- **Real-data wiring** of WP-157, WP-162, WP-196, and any later
  client-only widget WPs into actual server endpoints. Driven by
  the pre-mortem grouping (WP-B acquisition / WP-C retention /
  WP-D system health / WP-E content breadth — see WP-196 §Future
  Work for the grouping definition) and the server-side
  implementation of `/metrics/billing/health` (the endpoint path
  WP-196 locked).
- **Hanko-authenticated dashboard login** replacing the mock
  login. Depends on WP-160 / WP-161 patterns extended to the
  dashboard; separate WP. Until then, Cloudflare Access is the
  perimeter.
- **Multi-operator allow policy.** Single-operator policy ships;
  adding teammates is a one-line Cloudflare Access edit and does
  not warrant a WP.
- **Cost monitoring of CF Pages + Access usage.** Folds into
  WP-D (public-surface health + cost watchdog) per WP-196's
  pre-mortem grouping.

---

## Anti-Patterns to Avoid

- Do NOT attach the custom domain before the Cloudflare Access
  application exists — the window between domain attach and Access
  intercept exposes the mock login publicly.
- Do NOT set the DNS record to "DNS only" (gray cloud) — Cloudflare
  Access cannot intercept un-proxied traffic.
- Do NOT skip the `state: "planned"` initial entry and write
  `state: "live"` directly — `pnpm check:domains` only validates
  the `PENDING`→`READY`→`OK` lifecycle correctly when the entry
  starts as `planned`.
- Do NOT attach the dashboard custom domain to the
  `legendary-arena-play` or `legendary-arena-website` CF Pages
  projects — each surface must live on its own project so deploy
  failures are independent.
- Do NOT add `VITE_API_BASE_URL` to the CF Pages Production env
  scope while mocks are on — the env var is unused in mock mode
  and adding it before the real-data wiring WP lands invites a
  drift between local `.env` and production env that masks the
  real-data-wiring decision.
- Do NOT add new npm dependencies to the dashboard `package.json`
  in this WP — deploy first, scope changes later.
- Do NOT change the in-app mock login to require a real password
  or block specific emails — Access is the perimeter; double-
  gating is friction without security benefit.

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Probe returns `200` with the SPA shell, no Cloudflare Access redirect | Access application missing, or Access policy domain does not match `dashboard.legendary-arena.com` exactly. Treat as a security incident — the mock login is publicly exposed. |
| Probe returns `302` to a non-`cloudflareaccess.com` URL | DNS is pointing at the wrong CF Pages project, or a stale redirect rule is intercepting. |
| Probe returns `200` after auth but every widget renders `error` state | `VITE_USE_MOCKS=true` is missing from CF Pages Production env vars; widgets are trying to call `VITE_API_BASE_URL` and failing. |
| Probe returns `502` / `503` | CF Pages build failed, or the project is not yet provisioned. Check the Pages deploy log. |
| `pnpm check:domains` reports `FAIL` with `redirect mismatch: expected prefix "https://legendary-arena.cloudflareaccess.com/", got "https://accounts.cloudflareaccess.com/..."` | The Access application is on a different Cloudflare Access tenant than `legendary-arena`. Re-create on the `legendary-arena` tenant (the Zero Trust account associated with this zone). |
| Build succeeds but the SPA renders a blank page | `apps/dashboard/dist/` was not the configured output dir, OR `index.html` is at a sub-path. Re-check the CF Pages "Build output directory" field. |

---

## Rollback Posture

If any sub-task fails after Sub-task C (Access app created) — or
if the security tripwire trips at any point (a pre-auth
`curl -I https://dashboard.legendary-arena.com` returns `200`) —
the system MUST return to the pre-WP-197 state. Partial-state is
forbidden: half-attached DNS, orphaned Access apps, or stale
governance entries are drift vectors that confuse every future
operator and every probe.

The authoritative recovery contract is **EC-223 §Rollback
Procedure** (7 steps + a 3-axis verification). Summary for design
audit: remove the custom domain from CF Pages first (severs public
attack surface), then delete the Access application, then revert
all six repo edits (`domains.json`, `DOMAINS.md`, `DECISIONS.md`,
`STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md`), then verify cleanup
via `Select-String` + `pnpm check:domains` + `curl -I`.

The rollback returns reserved `D-19701` and `D-19702` to the free
pool. They have not "landed" if the WP rolled back; re-attempts of
this WP may reuse the same numbers.

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | All required WP sections present | PASS |
| 2 | Non-Negotiable Constraints present (engine-wide + packet-specific + session protocol + locked values) | PASS |
| 3 | `## Assumes` lists all dependencies | PASS — WP-157 + WP-162 + env var contract + Zero Trust plan state + `pnpm check:domains` existence |
| 4 | `## Context (Read First)` cites specific docs and sections | PASS — DOMAINS.md §ewiki + §dashboard + §"Adding a new subdomain" + §"Failure runbook", ARCHITECTURE Layer Boundary, DASHBOARD-REQUIREMENTS §1, WP-157 |
| 5 | `## Files Expected to Change` complete and bounded | PASS — 6 files, all governance + ops (no code) |
| 6 | Naming consistency | PASS — `legendary-arena-dashboard` project name, `dashboard` anchor, FQDN spelled out verbatim |
| 7 | Dependency discipline — no new npm packages | PASS — no `package.json` change |
| 8 | Architectural boundary — Server / Infra layer only | PASS — no engine, registry, preplan, server-code, or UI changes |
| 9 | Windows / PowerShell compatibility | PASS — verification uses `pwsh` + `Select-String` + `Get-Content`; `curl` is the only non-PS tool and is available on Windows 10/11 |
| 10 | Environment variable hygiene | PASS — `VITE_USE_MOCKS` and `NODE_VERSION` documented with scope (CF Pages Production); no secrets exposed |
| 11 | Auth posture | PASS (and N/A for code-level auth) — explicit commitment to Cloudflare Access Self-hosted + Email OTP + single-operator allow; mock in-app login retained behind the gate; rationale recorded as D-19701 |
| 12 | Tests — `node:test` only | N/A — no test files added |
| 13 | Verification steps — pnpm + pwsh, expected output | PASS — every step exact; expected output named |
| 14 | Acceptance criteria binary and observable | PASS — 4 groups (domains.json shape, DOMAINS.md row, deploy verification, scope enforcement) with binary checks |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX | PASS — items 5, 6, 7 |
| 16 | Code style (00.6) | N/A — no code authored |
| 17 | Vision Alignment | PASS — §13 Live Ops cited; conflict assertion = no conflict; non-goal proximity = none crossed; determinism preservation = N/A documented |
| 18 | Prose-vs-grep discipline | PASS — Verification Steps use specific JSON-field greps and `git diff` against named paths; no literal-string-scoped forbidden-token grep, so no enumeration risk |
| 19 | Bridge-vs-HEAD staleness | N/A — this packet authors no repo-state-summarizing artifact |
| 20 | Funding Surface Gate | N/A with justification — operator dashboard behind Access, not a funding affordance |
| 21 | API Catalog (D-11804) | N/A with justification — no `apps/server` HTTP endpoint or library function added/modified/status-changed; mock mode means zero HTTP calls leave the SPA |
