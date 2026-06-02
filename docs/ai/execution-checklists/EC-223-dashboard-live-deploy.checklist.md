# EC-223 — Dashboard Live Deploy (Cloudflare Pages + Access Gate)

**Source:** docs/ai/work-packets/WP-197-dashboard-live-deploy.md
**Layer:** Server / Infra (deploy + governance; no `apps/server` or `apps/dashboard/src` code edit)

## Pre-Session Actions (PS-1..PS-2) — Blocking

- [ ] **PS-1 — Cloudflare Zero Trust plan active.** The `legendary-arena.com` account's Zero Trust plan must be activated at execution time. The "Add an Application" tile in Zero Trust → Access is gated behind plan activation and will silently produce no Access intercept if inactive. Last verified active 2026-05-08 (DOMAINS.md §ewiki step 2). If inactive, STOP and ask the operator to re-activate before Sub-task C.
- [ ] **PS-2 — Sub-task ordering locked.** Sub-tasks MUST execute in order: A (`domains.json` row, `state: "planned"`) → B (CF Pages project + first build) → **C (CF Access application created)** → **D (custom domain attached + DNS proxied)** → E (probe verdict + `state` flip) → F (DOMAINS.md row update) → G (D-19701, D-19702 appended) → H (STATUS + WORK_INDEX). Attaching the custom domain (D) BEFORE the Access policy (C) exposes the public-mock-login window the `ewiki.` precedent warns against.
- [ ] **PS-2.1 — Artifact-based sequencing enforcement.** Before starting each sub-task, the executor MUST confirm the immediately preceding sub-task produced its expected artifact. If the artifact is missing, STOP and mark `BLOCKED`; do not proceed.
  - After A → `Select-String -Path docs\ops\domains.json -Pattern '"anchor": "dashboard"'` returns exactly 1 match AND that entry's `state` reads `"planned"`.
  - After B → CF Pages dashboard shows a successful production build (deploy ID + green status); `legendary-arena-dashboard.pages.dev` resolves and serves the SPA shell.
  - After C → Cloudflare Zero Trust → Access → Applications lists `dashboard.legendary-arena.com` with identity provider = Email OTP and allow policy = exactly `jeff@barefootbetters.com`.
  - After D → DNS record `CNAME dashboard → legendary-arena-dashboard.pages.dev` exists in the `legendary-arena.com` zone AND is proxied (orange cloud).
  - After E → `pnpm check:domains` emits verdict `READY` (pre-flip) then `OK` (post-flip) for the `dashboard` entry.

If any PS item is unsatisfied, the executor STOPS and reports `BLOCKED` rather than attempting workarounds.

## Before Starting

- [ ] WP-157 Done ✅ — `apps/dashboard` SPA scaffold present; `apps/dashboard/vite.config.ts` emits `__GIT_SHA__` / `__BUILD_TIMESTAMP__` / `__APP_VERSION__`; output dir `dist/` confirmed.
- [ ] WP-162 Done ✅ — UI polish landed (commit `54007cc`); dashboard `/overview` renders existing widgets.
- [ ] `apps/dashboard/.env.example` line 3 = `VITE_USE_MOCKS=true` (env-var contract confirmed).
- [ ] `pnpm dash:build` exits 0; `apps/dashboard/dist/` produced cleanly.
- [ ] `pnpm check:domains` script exists in `package.json` (`node scripts/check-subdomains.mjs`).
- [ ] `docs/ops/DOMAINS.md` line 31 carries the `dashboard.legendary-arena.com` row with state `planned`.
- [ ] `docs/ops/domains.json` has **zero** entries with `"anchor": "dashboard"` at baseline.

## Locked Values (do not re-derive)

| Item | Value |
|---|---|
| Subdomain | `dashboard.legendary-arena.com` |
| CF Pages project name | `legendary-arena-dashboard` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/dashboard..." build` |
| Output directory | `apps/dashboard/dist` |
| Production env vars | `VITE_USE_MOCKS=true`, `NODE_VERSION=22` |
| DNS posture | Proxied (orange cloud) — required for Cloudflare Access intercept |
| CF Access tile | Self-hosted (NOT "Connect a private web application") |
| Identity provider | Email One-time PIN (built-in) |
| Allow policy | Single rule: Emails = `jeff@barefootbetters.com` |
| `expectedStatus` | `[302, 401, 403]` (exact closed three-value set) |
| `expectedLocation` prefix | `https://legendary-arena.cloudflareaccess.com/` |
| Anchor in DOMAINS.md / domains.json | `dashboard` |
| `source` field | `apps/dashboard` |
| `host` field | `Cloudflare Pages + Cloudflare Access` |
| Initial `state` (Sub-task A) | `"planned"` |
| Final `state` (Sub-task E, after `READY`) | `"live"` |
| `name` field | `Internal admin dashboard` |
| D-entries to append | `D-19701` (CF Pages + Access posture), `D-19702` (initial deploy ships mock-mode) |

## Probe Lifecycle (Deterministic Contract — Must Be Followed Exactly)

`pnpm check:domains` emits these verdicts for the `dashboard` entry in this exact order. Treat the lifecycle as a state machine; out-of-order transitions are FAIL.

| Step | When | Expected verdict |
|---|---|---|
| 1 | Sub-task A landed; B/C/D not yet — `state: "planned"`, DNS not resolving at CF Pages | `PENDING` |
| 2 | Sub-tasks B + C + D landed; `state: "planned"` retained — DNS + Pages + Access all wired | `READY` |
| 3 | Sub-task E flipped `state` to `"live"` | `OK` |

Rules:

- `READY` MUST occur BEFORE the `state` flip. Flipping on `PENDING` corrupts the lifecycle and turns future pre-deploy `PENDING`s into misleading `FAIL`s.
- `OK` MUST occur AFTER the `state` flip. `OK` before the flip is impossible by construction.
- Any out-of-order or unexpected verdict (`FAIL` after `READY`, `PENDING` after `OK`, `READY` not reached after D) → STOP, revert `state` to the prior value, re-probe, and triage per §Common Failure Smells before retrying.

## Guardrails

- **CANONICAL RULE — Gate-before-expose.** The system MUST be protected by Cloudflare Access BEFORE any public DNS attach. Sub-task C strictly precedes Sub-task D. Violations are security incidents, not deploy bugs. This rule is reusable across future Access-gated WPs and supersedes any contradictory operator UI flow Cloudflare's dashboard may suggest.
- **MUST NOT modify `apps/dashboard/src/**`** — UI changes ride a separate WP. `git diff --name-only -- apps/dashboard/src/` returns empty.
- **MUST NOT modify `apps/server/src/**`** — no CORS edit, no new endpoint. The dashboard makes zero HTTP calls to `api.legendary-arena.com` while mocks are on.
- **MUST NOT modify `pnpm-lock.yaml`** — no new npm dependencies.
- **MUST NOT attach the custom domain before the Access application exists** (Sub-task C strictly precedes Sub-task D). The window between attach and Access intercept exposes the in-app mock login publicly.
- **MUST NOT set DNS to "DNS only" (gray cloud)** — Cloudflare Access cannot intercept un-proxied traffic. Verify orange-cloud after auto-creation.
- **MUST NOT attach the dashboard custom domain to `legendary-arena-play` or `legendary-arena-website` CF Pages projects** — each surface lives on its own project so deploy failures stay independent.
- **MUST NOT flip `state` to `"live"` before `pnpm check:domains` reports `READY`** for the `dashboard` entry. Flipping earlier turns a future pre-deploy `PENDING` into a misleading `FAIL`.
- **MUST NOT add `VITE_API_BASE_URL` to the CF Pages Production env scope** while mocks are on — adding it before the real-data wiring WP lands invites drift between local `.env` and production env.
- **MUST NOT add new flags, fields, or env vars beyond the Locked Values table.**
- **MUST NOT configure Access allow rules for any identity other than `jeff@barefootbetters.com`.** The single-operator allow policy is intentional during pre-launch to keep the attack surface minimal. Expanding the allow list is a one-line Cloudflare Access edit but requires a separate WP per the source WP §Out of Scope.

## Security Tripwire (Live Invariant — Verified Continuously After Sub-task C)

After Sub-task C lands and at every checkpoint thereafter, the following MUST hold:

**`curl -I https://dashboard.legendary-arena.com` MUST NOT return `200` from an unauthenticated client.**

Required states:

- **Pre-auth (unauthenticated probe):** `302` (redirect to `*.cloudflareaccess.com`) OR `401` OR `403`.
- **Post-auth (within an authenticated browser session, after Email OTP completes):** `200` is expected — and ONLY here.

If a pre-auth `200` is observed at ANY point during or after execution:

1. STOP immediately. Do not proceed to further sub-tasks.
2. Classify as **SEV-0 (public mock-login exposure)** — the in-app mock login accepts any email + any role.
3. Trigger the §Rollback Procedure to return the system to the pre-WP-197 state.
4. Re-attempt the WP only after root cause is identified (Access policy domain mismatch, wrong CF tenant, missing Access app).

Tripwire checkpoints (minimum): immediately after Sub-task D completes; immediately after Sub-task E `state` flip; during §After Completing; and at any later observation while the deploy remains live.

## Required `// why:` Comments

N/A — no code authored. The two D-entries in `docs/ai/DECISIONS.md` carry the durable rationale; the `notes` field in the `domains.json` row carries the operator-facing rationale (a `200` here = misconfig; `expectedLocation` is a prefix).

## Files to Produce (Diff Contracts)

Each bullet is a closed diff contract — additions only, scoped to one row/block/entry per file. Edits to any prior row, entry, or section in these files are FAIL.

- `docs/ops/domains.json` — **modified** — EXACTLY one new entry appended (adjacent to the existing `legends` entry) with the field shapes in §Locked Values. Initial `state: "planned"`, flipped to `"live"` in Sub-task E. **No other entries modified; no field reordered in any other row.**
- `docs/ops/DOMAINS.md` — **modified** — EXACTLY one row's State column changes (line 31, `dashboard` row, `planned` → `live`) AND its notes are extended (live-since date, CF Pages project name, Access posture, mock-mode statement). If a per-section `### dashboard` block under §"Per-subdomain detail" does not yet exist, EXACTLY one new section is added mirroring §ewiki (Source / Renderer / Gate / DNS posture / Healthy response / Configuration steps). **No other rows or sections edited.**
- `docs/ai/DECISIONS.md` — **modified** — EXACTLY two new entries appended (`D-19701`, `D-19702`) per the WP §Decisions Introduced table. **No edits to any prior D-entry; no reordering.**
- `docs/ai/STATUS.md` — **modified** — EXACTLY one new status block appended noting dashboard reachable behind Cloudflare Access at `https://dashboard.legendary-arena.com`. **No prior blocks modified.**
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — EXACTLY one new WP-197 row added in the Phase 8+ (dashboard) section (OR deferred to a follow-up SPEC commit per Sub-task H if WP-196's WORK_INDEX edit is still racing at execution time). **No prior rows modified.**
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EXACTLY one row state flip (EC-223 → Done). **No other rows modified.**

## Rollback Procedure (If Any Sub-task Fails After C, Including Security Tripwire Trip)

If failure occurs after Sub-task C lands (Access app created) — including a `200` pre-auth response or any other tripwire trip — return the system to the pre-WP-197 state. Do NOT leave partial state.

1. **Remove the custom domain from CF Pages** (Cloudflare Pages → `legendary-arena-dashboard` → Custom domains → remove `dashboard.legendary-arena.com`). This severs the public attack surface first.
2. **Delete the Cloudflare Access application** (Zero Trust → Access → Applications → delete the `dashboard.legendary-arena.com` entry) OR disable its policy if deletion is gated by your role.
3. **Revert `docs/ops/domains.json`** — REMOVE the `dashboard`-anchor entry entirely. Do NOT just flip `state` back to `"planned"`; the entry should not exist post-rollback.
4. **Revert `docs/ops/DOMAINS.md`** — restore line 31 State column to `planned`; remove any new `### dashboard` section; remove notes additions.
5. **Revert `docs/ai/DECISIONS.md`** — remove `D-19701` and `D-19702` (they have not "landed" if execution rolled back; the D-numbers return to the free pool).
6. **Revert `docs/ai/STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md`** — remove the WP-197 / EC-223 status changes.
7. **Verify cleanup:**
   - `Select-String -Path docs\ops\domains.json -Pattern '"dashboard'` returns zero matches.
   - `pnpm check:domains` exits 0 with no `FAIL` regressions on other entries.
   - `curl -I https://dashboard.legendary-arena.com` fails to resolve (DNS removed) — NOT a `200` from the now-orphaned CF Pages.

Goal: zero orphaned DNS, zero half-configured Access apps, zero stale governance entries. The repo is byte-identical (modulo the WP-197 + EC-223 files themselves and any post-mortem the failure produced) to the pre-WP-197 state.

## After Completing

- [ ] `pnpm check:domains` returns `OK` for the `dashboard` entry (was `PENDING` pre-deploy, `READY` after deploy, `OK` after `state` flip).
- [ ] `curl -I https://dashboard.legendary-arena.com` returns `HTTP/302` with `Location:` starting `https://legendary-arena.cloudflareaccess.com/`. A `200` here = `BLOCKED`, treat as security incident.
- [ ] Authenticated browser session (post-OTP) loads the SPA shell; `/login` renders; selecting `admin` routes to `/overview`; every widget shows its `MOCK` freshness badge.
- [ ] `VersionBadge` git SHA on the deployed build matches the commit that triggered the CF Pages production build.
- [ ] `git diff --name-only origin/main -- apps/dashboard/src/ apps/server/src/` empty.
- [ ] `git diff --stat pnpm-lock.yaml` empty.
- [ ] `git status --porcelain` shows only files in §Files to Produce; no out-of-scope edits.
- [ ] `Select-String -Path docs\ops\domains.json -Pattern '"anchor": "dashboard"'` returns exactly 1 match.
- [ ] `($json.domains | Where-Object { $_.anchor -eq 'dashboard' }).state` returns `live` after the Sub-task E flip.
- [ ] `docs/ai/DECISIONS.md` contains `D-19701` and `D-19702` with rationale per the WP §Decisions Introduced table.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/work-packets/WORK_INDEX.md` carries WP-197 row (or follow-up SPEC commit scheduled); `docs/ai/execution-checklists/EC_INDEX.md` EC-223 row flipped to Done.
- [ ] **Drift reconciliation — `domains.json` vs live infrastructure.** After Sub-task E `state` flip, the manifest row MUST match the actual deploy posture across all four axes:
  - **CF Pages project name** = `legendary-arena-dashboard` (visible in the Pages dashboard URL slug).
  - **DNS** record `dashboard.legendary-arena.com → CNAME → legendary-arena-dashboard.pages.dev` exists, is proxied (orange cloud), and is the only record for that hostname.
  - **Cloudflare Access** application exists for `dashboard.legendary-arena.com` (Self-hosted, Email OTP, single-operator allow = `jeff@barefootbetters.com`).
  - **`domains.json` row** carries `state: "live"`, `host: "Cloudflare Pages + Cloudflare Access"`, `source: "apps/dashboard"`, `anchor: "dashboard"`.
  - Any mismatch on any axis → treat as drift → mark `BLOCKED` until reconciled. The dashboard's future Drift Detection widget reads `domains.json` as authoritative; metadata that diverges from infra lies to every consumer downstream.
- [ ] **Security tripwire — final check.** `curl -I https://dashboard.legendary-arena.com` from an unauthenticated client returns `302` (not `200`). If a second network / device is available, re-run from it to rule out single-client cache anomaly.

## Common Failure Smells

- Probe returns `200` with the SPA shell, no Access redirect → Access application missing OR application domain mismatch with `dashboard.legendary-arena.com`. **Security incident** — the mock login is publicly exposed.
- Probe returns `302` to a non-`cloudflareaccess.com` URL → DNS pointing at the wrong CF Pages project, or a stale Cloudflare redirect rule is intercepting.
- Probe returns `200` post-auth but every widget renders `error` state → `VITE_USE_MOCKS=true` missing from CF Pages Production env vars; widgets are trying to call `VITE_API_BASE_URL`.
- Probe returns `502`/`503` → CF Pages build failed or project not yet provisioned. Check the Pages deploy log.
- `pnpm check:domains` reports `FAIL` with `redirect mismatch: expected prefix "https://legendary-arena.cloudflareaccess.com/", got "https://accounts.cloudflareaccess.com/..."` → Access app on a different Cloudflare tenant. Re-create on the `legendary-arena` Zero Trust tenant.
- Build succeeds but the SPA renders blank → `apps/dashboard/dist/` was not the configured output dir. Re-check the CF Pages "Build output directory" field.
- `state` flipped to `"live"` before `READY` reported → `pnpm check:domains` lifecycle (`PENDING`→`READY`→`OK`) corrupted; revert the `state` to `"planned"`, re-probe, then flip on `READY`.
- DNS auto-created as gray-cloud and not manually flipped → Access cannot intercept; the gate is silently bypassed. Verify orange-cloud after the auto-create step.
- Custom domain attached to `legendary-arena-play` (game client) or `legendary-arena-website` (marketing) project → cross-project coupling; deploy failures bleed across surfaces. Re-attach to `legendary-arena-dashboard`.
- `VITE_API_BASE_URL` set on the CF Pages Production scope while mocks are on → drift vector. Remove it; the env var lands with the real-data wiring WP, not this one.
- `pnpm-lock.yaml` changed → unauthorized dependency edit; revert.
- Access allow rule expanded to a team / group / second email mid-execution → single-operator guardrail violation. Fix: revert to a single rule with `Emails = jeff@barefootbetters.com`; expanding allow scope is a separate WP.
- Rollback executed but `docs/ops/domains.json` still carries the `dashboard`-anchor entry → drift vector. Fix: per §Rollback Procedure step 3, the entry must be removed entirely (not state-flipped back to `"planned"`).
- Sub-task started without artifact-check on the previous sub-task → PS-2.1 violation; downstream sub-tasks may build on missing prerequisites (e.g., domain attach on a non-existent Access app). Fix: run the artifact check before each sub-task; STOP and BLOCKED if missing.
- Probe verdict skipped a state (e.g., `PENDING` → `OK` with no `READY` observed) → probe-lifecycle violation, usually means the operator flipped `state` to `"live"` without verifying the deploy resolves. Fix: revert `state` to `"planned"`, re-probe through the full lifecycle.
