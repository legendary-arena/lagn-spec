# EC-175 — Arena Client API Base URL Surfacing (Execution Checklist)

**Source:** docs/ai/work-packets/WP-161-arena-client-api-base-url.md
**Layer:** App / Client (`apps/arena-client/src/lib/api/**`) + governance

## Before Starting
- [ ] WP-104 / WP-106 / WP-108 / WP-110 / WP-132 / WP-133 / WP-160 marked `[x]` in WORK_INDEX
- [ ] `git rev-parse origin/main` at-or-past `285ed3b` (the WP-160 lockfile-hotfix merge)
- [ ] `pnpm install --frozen-lockfile` exits 0 (baseline)
- [ ] `pnpm --filter @legendary-arena/arena-client test` baseline is `326 / 0 / 0 / 0`
- [ ] Confirmed 7 fetch sites: `Get-ChildItem apps/arena-client/src/lib/api -Filter *.ts | Select-String -Pattern "fetch\('/api"` returns 6 matches (the 7th is the template-literal in `profileApi.ts:84` which doesn't match this pattern)

## Locked Values (do not re-derive)
- **New env var:** `VITE_API_BASE_URL`
- **Helper module path:** `apps/arena-client/src/lib/api/apiBaseUrl.ts`
- **Helper exports (exactly 2):** `apiBaseUrl: string`, `buildApiUrl(path: string): string`
- **Local-dev fallback URL:** `http://localhost:8000` (matches `VITE_SERVER_URL` precedent)
- **Resolution expression:** `import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000'`
- **Decisions reserved:** D-16101 (env-var-based API base URL surfacing)
- **Total fetch-site rewrites:** 7 (3 in `ownerProfileApi.ts`, 2 in `billingApi.ts`, 1 in `adminBillingApi.ts`, 1 in `profileApi.ts`)

## Guardrails
- **No wire-shape change.** API client function signatures, return shapes, error handling, JSDoc preserved byte-identical EXCEPT the new import line and the fetch-site rewrites.
- **No new npm deps.** WP-161 adds zero packages.
- **No server-side touch.** `apps/server/src/**` unchanged. `data/migrations/**` unchanged. `docs/ai/REFERENCE/api-endpoints.md` unchanged.
- **No test count change.** Baseline 326 preserved. No fetch-mock tests added (ceremonial; deferred per WP body §Test discipline).
- **No `_redirects` / `_routes.json` file.** WP-161 rejected this alternative per WP body §Justification.
- **`apiBaseUrl` is a top-level constant.** No factory, no lazy initializer, no memoization beyond what `import.meta.env`'s build-time inlining already provides.
- **`buildApiUrl` is pure string concatenation.** No validation, no URL encoding, no trailing-slash handling. Caller-trusted.
- **The string `/api/` appears in every fetch site.** The path passed to `buildApiUrl` always starts with `/api/`. Grep gate: `grep -n "buildApiUrl(" apps/arena-client/src/lib/api/*.ts` matches only paths beginning with `/api/`.

## Required `// why:` Comments
- `apiBaseUrl.ts` module header: cite WP-161 + D-16101; explain that the build-time env var is mirroring `VITE_SERVER_URL` precedent; explain that the local-dev fallback `http://localhost:8000` is the same shape as the boardgame.io server's default.
- `.env.example` `VITE_API_BASE_URL` block: explain that CF Pages production deployments MUST set this in the project's build-time env (mirrors the `VITE_HANKO_TENANT_BASE_URL` block precedent); document the per-environment source pattern.

## Files to Produce
**New (1):**
- `apps/arena-client/src/lib/api/apiBaseUrl.ts`

**Modified (5):**
- `apps/arena-client/src/lib/api/ownerProfileApi.ts` (3 fetch-site rewrites + 1 import)
- `apps/arena-client/src/lib/api/billingApi.ts` (2 fetch-site rewrites + 1 import)
- `apps/arena-client/src/lib/api/adminBillingApi.ts` (1 fetch-site rewrite + 1 import)
- `apps/arena-client/src/lib/api/profileApi.ts` (1 fetch-site rewrite + 1 import)
- `apps/arena-client/.env.example` (`VITE_API_BASE_URL` block added)

**Governance (4):**
- `docs/ai/work-packets/WORK_INDEX.md` — WP-161 row flipped `[ ]` → `[x]` with post-execution summary
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-175 row Status `Done <date>`
- `docs/05-ROADMAP-MINDMAP.md` — WP-161 ✅ added; Progress Summary bumped; Last Updated footer refreshed
- `docs/ai/DECISIONS.md` — D-16101 appended

## After Completing
- [ ] `pnpm install --frozen-lockfile` exits 0 (CF Pages CI parity)
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0 with no `Boundary Leakage detected` thrown
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 with `326 / 0 / 0 / 0` (no test count change)
- [ ] Repo-wide grep `grep -rn "fetch\('/api" apps/arena-client/src/lib/api/` returns ZERO matches
- [ ] Repo-wide grep `grep -rn "buildApiUrl" apps/arena-client/src/lib/api/` returns at least 7 matches (one import per file + one call per fetch site + the helper file's exports)
- [ ] `git diff --stat -- 'apps/server/**' 'packages/**' 'data/**' 'docs/ai/REFERENCE/**'` is empty
- [ ] STATUS.md updated with WP-161 completion entry
- [ ] DECISIONS.md updated with D-16101 (Decision + Rationale + Alternatives Rejected — minimum 2 alternatives)
- [ ] WORK_INDEX.md WP-161 marked `[x]`
- [ ] EC_INDEX.md EC-175 marked `Done <date>`
- [ ] ROADMAP-MINDMAP WP-161 ✅
- [ ] Commit message body declares `01.5 NOT INVOKED` and `01.6 SKIPPED (mechanical URL-prefix change; no long-lived abstraction)`
- [ ] **Operator post-merge:** set `VITE_API_BASE_URL=https://api.legendary-arena.com` in CF Pages Production scope → retry deployment → smoke-test `https://legendary-arena-play.pages.dev/?route=me` end-to-end (the WP-160 smoke that's been blocked on this fix)

## Common Failure Smells
- **"Build passes but production still hangs on Loading…"** Either the env var wasn't set on CF Pages, or it was set after the build kicked off, or the build was cached. Curl the deployed bundle and grep for the literal env var name — if it's still present, Vite didn't inline a real value. Set + retry deployment.
- **"Local dev breaks after the change."** Confirm the local server is running on `http://localhost:8000`. The fallback string is hard-coded; if you've configured a different local port, set `VITE_API_BASE_URL` in your local `.env`.
- **"Tests fail with `fetch is not defined` or similar."** The 4 API client files don't have tests; this WP didn't add any. If this surfaces, the bug is elsewhere — investigate the failing test rather than weakening this WP.
- **"`apiBaseUrl` is `undefined` at runtime."** `import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000'` should never yield undefined. If it does, the build environment is misconfigured — investigate Vite version compatibility.
