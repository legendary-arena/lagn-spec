# WP-241 — Dashboard Operator Auth + Bearer Cutover (Real Hanko Login → `Authorization: Bearer` on the LIVE Fetchers)

**Status:** Draft
**Primary Layer:** Dashboard (`apps/dashboard/**`) only. No `apps/server`, engine, registry, or migration change; no new endpoint. One new npm dependency (`@teamhanko/hanko-elements`, already used by `apps/arena-client`).
**Dependencies:** WP-197 ✅ (dashboard CF Pages deploy + Access gate, mock-mode), WP-206 ✅ (analytics LIVE fetchers + `isLiveModeEnabled` gate), WP-238 ✅ (sweep LIVE fetcher), WP-239 ✅ (triage LIVE fetchers), WP-160 ✅ (arena-client Pinia auth-store contract — the pattern mirrored), WP-126 ✅ (`apps/arena-client/src/auth/hankoClient.ts` Hanko wrapper — the pattern mirrored), WP-112 ✅ (`requireAuthenticatedSession` — the bearer-only server contract this complies with).

---

## Goal

After this session the operator dashboard **authenticates for real**, so the
existing LIVE fetchers can actually reach the session-gated API. The dashboard's
mock login (which accepts any email and fabricates a role) is replaced with a real
Hanko login — mirroring `apps/arena-client` — that yields a session JWT; the three
LIVE fetcher families (analytics WP-206, sweep WP-238, triage WP-239) attach that
JWT as `Authorization: Bearer` instead of `credentials: 'include'`. This
**supersedes D-20601's cookie posture** for the dashboard→API path and makes the
client comply with the server's bearer-only `requireAuthenticatedSession`
(D-11202). After this WP, flipping the deploy env (`VITE_USE_MOCKS=false` +
`VITE_API_BASE_URL=https://api.legendary-arena.com`) actually returns real data
instead of 401-ing — closing the gap WP-206/238/239 left because the dashboard had
no real credential to send.

## Session Context

Auditing the dashboard for the LIVE cutover surfaced a hard blocker (2026-06-12):
flipping the env vars would 401 every session-gated fetch. Two root causes:

1. **Cookie-vs-bearer mismatch.** The LIVE fetchers send `credentials: 'include'`
   (cookie) + no `Authorization` header (D-20601), but the server reads the token
   **exclusively** from `Authorization: Bearer` and D-11202 forbids the cookie
   path. The server sets no session cookie at all, so the cookie carries nothing.
   The `server.mjs` CORS comment claiming the dashboard "consumes the operator's
   cookie-credentials Hanko session" describes a path that was never built. The
   cookie posture had never run live because the dashboard has always been MOCK.
2. **The dashboard login is 100% mock.** `pages/auth/LoginPage.vue` builds a fake
   `AuthUser` (hardcoded id, a role from a dropdown, "any email accepted") into a
   local Pinia store — no Hanko, no server call, no token to attach.

`apps/arena-client` already solved this exact problem (Hanko login → bearer token →
API calls with `Authorization: Bearer`). This WP ports that proven pattern to the
dashboard. The server is **unchanged** — it already validates Hanko bearer JWTs via
`HANKO_TENANT_BASE_URL` / `HANKO_EXPECTED_AUDIENCE`. The Cloudflare Access gate
(WP-197) remains the operator-reachability boundary in front of the Pages deploy;
this WP adds the **API-session credential** the operator's browser then presents to
`api.legendary-arena.com`.

Rejected alternatives (2026-06-12): trusting the Cloudflare Access JWT would
require putting `api.legendary-arena.com` behind Access, but that host also serves
the game client (`play.*` with Hanko bearer) — Access-gating it breaks gameplay. A
service token can't live safely in a Vite-inlined client bundle. A real Hanko login
sending bearer to the already-bearer-only server is the clean fit.

## Assumes

> Verify before writing a line. If any is false, this packet is **BLOCKED**.

- `apps/arena-client/src/auth/hankoClient.ts` exports `initializeHankoClient({ tenantBaseUrl }): Promise<HankoClientHandle>`, `subscribeToSessionEvents`, the `HankoLike` interface, `HankoInitializationFailed`, and a `__hankoFactory` test seam (WP-126 / D-16005). It is the structural template; the dashboard gets its own copy (layer boundary forbids importing across `apps/*`).
- `apps/arena-client/src/stores/auth.ts` (WP-160 / D-16003) is a Pinia store exposing `token: Ref<string | null>`, `accountId`, a derived `isAuthenticated` (`token !== null`), and `setSession(token, accountId?)` / `clearSession()` / `bootstrapFromCachedToken(cachedToken)`. It is the auth-store template.
- `apps/arena-client/src/App.vue` initializes Hanko on mount from `import.meta.env.VITE_HANKO_TENANT_BASE_URL` (falling back to the LoginPage when empty/unreachable) and `apps/arena-client/src/pages/LoginPage.vue` renders `<hanko-auth :api="tenantBaseUrl">`. `apps/arena-client/src/lib/api/billingApi.ts` attaches `headers: authToken === null ? {} : { Authorization: \`Bearer ${authToken}\` }`.
- `apps/dashboard/src/services/{analyticsLiveFetchers,sweepLiveFetchers,triageLiveFetchers}.ts` each declare `const FETCH_OPTIONS: RequestInit = { credentials: 'include', headers: { Accept: 'application/json' } }` and use it in `fetch(url, FETCH_OPTIONS)`. They read env via an injectable `readEnv()` with a `__testHooks` seam.
- `apps/dashboard/src/stores/auth.ts` + `apps/dashboard/src/pages/auth/LoginPage.vue` are the mock login (`useAuthStore.login(mockUser)`; `AuthUser` / `UserRole` in `apps/dashboard/src/types/index.ts`). `apps/dashboard/src/router/index.ts` gates routes on `authStore.isAuthenticated`.
- `apps/dashboard/src/main.ts` calls `createApp(App)` + `app.use(createPinia())`. `apps/dashboard/.env.example` lists `VITE_API_BASE_URL`, `VITE_WS_URL`, `VITE_USE_MOCKS`, `VITE_FEATURE_FLAGS` (no Hanko var).
- `apps/server` validates Hanko bearer sessions (`requireAuthenticatedSession` / `extractBearerToken`, D-11202) — no server change is needed; the `dashboard.legendary-arena.com` CORS origin is already allowlisted (`server.mjs`, WP-206).

## Scope (In)

**A) Hanko client wrapper — `apps/dashboard/src/auth/hankoClient.ts` (NEW)**
Port `apps/arena-client/src/auth/hankoClient.ts`: `HankoLike` interface, `initializeHankoClient({ tenantBaseUrl, __hankoFactory? }): Promise<HankoClientHandle>`, `subscribeToSessionEvents(handle, listeners)`, `HankoInitializationFailed`. Wraps `@teamhanko/hanko-elements` at runtime; the `__hankoFactory` seam keeps tests broker-free. No import from `apps/arena-client` (layer boundary — duplicate per 00.6 Rule 1; a shared client-auth package is premature at the second copy).

**B) Real auth store — `apps/dashboard/src/stores/auth.ts` (MODIFIED — rewrite)**
Mirror the WP-160 store: `token: Ref<string | null>`, `accountId`, derived `isAuthenticated` (`token !== null`), `setSession(token, accountId?)`, `clearSession()`, `bootstrapFromCachedToken(cachedToken)` (null-cached-token must not clobber a set session — the D-16003 guard). Remove the mock `AuthUser`/`login(mockUser)` surface.

**C) Hanko init on mount — `apps/dashboard/src/App.vue` (MODIFIED)**
Mirror arena-client App.vue. After Pinia is available, call `registerAuthTokenReader(() => authStore.token)` **once** so the live fetchers resolve the store token deterministically (no implicit `useAuthStore()` inside a plain module). Then, **idempotently** — a component/module-scoped `hankoInitialized` guard; repeat mounts MUST NOT re-init or re-subscribe — read `VITE_HANKO_TENANT_BASE_URL`; if empty, fall through to the LoginPage (test/dev/unconfigured); else `initializeHankoClient` + `subscribeToSessionEvents` → on session, `authStore.setSession(token)`; on expiry/logout, `clearSession()`. `HankoInitializationFailed` falls back to the LoginPage, never throws to the user.

**D) Real login page — `apps/dashboard/src/pages/auth/LoginPage.vue` (MODIFIED — rewrite)**
Replace the mock email/role form (and the "any email accepted" note) with `<hanko-auth :api="tenantBaseUrl">` (tenant from `VITE_HANKO_TENANT_BASE_URL`), mirroring arena-client LoginPage. The role dropdown is removed (roles are out of scope — see D-24004).

**E) Live-fetch auth seam — `apps/dashboard/src/services/authToken.ts` (NEW)**
The single shared module the three fetchers depend on — **implement BEFORE editing the fetchers**. Exports:
- `registerAuthTokenReader(fn: () => string | null): void` — called **once** from `App.vue` after Pinia is created, wiring the live token source. NO implicit `useAuthStore()` inside a plain module (deterministic — eliminates the Pinia-timing false-null where a fetch fires before mount and binds to no/another Pinia instance).
- `readAuthToken(): string | null` — returns the registered reader's value, or `null` when no reader is registered (pre-mount / tests). `__testHooks.setAuthToken(fn)` injects in tests.
- `buildLiveRequestOptions(token: string): RequestInit` — the **sole** producer of live-fetch options: `{ headers: { Accept: 'application/json', Authorization: \`Bearer ${token}\` } }`. All three fetchers call it; no per-file header construction (drift-proof).
- `handleMissingAuthToken(cacheRef, warnOnceSet): ServiceResponse` — the **sole** fail-silent path: one-shot DEV `console.warn` keyed in `warnOnceSet`, then return `cacheRef.value` (prior cache/sentinel) unchanged; no request fired.
Keeps the plain-module fetchers decoupled from Vue/Pinia and fully test-injectable.

**F) Bearer on the three LIVE fetchers — `analyticsLiveFetchers.ts` / `sweepLiveFetchers.ts` / `triageLiveFetchers.ts` (MODIFIED ×3)**
Delete the static `FETCH_OPTIONS` cookie const. Each fetcher's fire path becomes, verbatim and identical across the three: `const token = readAuthToken(); if (token === null) return handleMissingAuthToken(cacheRef, warnOnceSet);` (no request fired) else `fetch(url, buildLiveRequestOptions(token))`. **All header construction and the fail-silent path come from the shared `authToken.ts` helpers — never re-implemented per file** (drift-proof). `credentials: 'include'` is removed entirely; the `// why:` comment becomes `// why: server requires Authorization: Bearer (D-11202); cookies are ignored — supersedes D-20601 (D-24003)`. Fetcher signatures + the synchronous-getter + cached-`Ref` + object-envelope + single-request contracts are otherwise byte-stable.

**G) Env + types — `apps/dashboard/.env.example` (MODIFIED) + `apps/dashboard/src/types/index.ts` (MODIFIED)**
Add `VITE_HANKO_TENANT_BASE_URL=` to `.env.example`; correct the wrong `VITE_API_BASE_URL` default (`http://localhost:3001/api/dash` → `http://localhost:3001`, since fetchers append `/api/...`) with a comment that the production value is `https://api.legendary-arena.com`. In `types/index.ts`, retire the mock `AuthUser`/`UserRole` role surface to whatever the new store needs (identity-only); leave any unrelated types intact.

**H) Tests — NEW/MODIFIED**
`auth/hankoClient.test.ts` (NEW, `__hankoFactory` seam — broker-free), `stores/auth.test.ts` (NEW/MODIFIED — token lifecycle + the bootstrap null-guard), and the three fetcher `.test.ts` updated: assert `Authorization: Bearer <token>` is present on the issued request, no `credentials: 'include'`, and the null-token fail-silent path. `node:test`/`node:assert`; no network; no boardgame.io.

## Out of Scope

- **Server-side changes** — no `apps/server` edit. `requireAuthenticatedSession` (D-11202 bearer-only) is already compatible; the CORS origin is already allowlisted. No new endpoint, migration, or library function.
- **Admin role enforcement (D-24004 — DEFERRED).** The endpoints stay `authenticated-session-required` (any account). The residual — any logged-in player could call `/api/inspection/latest` directly — exists TODAY and is not introduced here; the CF Access gate (WP-197) is the operator boundary for the dashboard UI. True role-scoping is a server change + a follow-up WP. The dashboard router continues gating purely on `isAuthenticated` (`token !== null`); NO role-based routing is introduced.
- **The actual CF Pages env flip + redeploy** (`VITE_USE_MOCKS=false` + `VITE_API_BASE_URL`) — an operator action in the Cloudflare dashboard, documented in §Verification, NOT a repo change. (`VITE_*` are build-time-inlined; the flip needs a redeploy.)
- **Per-widget mock/live indicator** — the mixed-mode footgun (live triage next to still-mock KPIs) is a follow-up WP; `useMockModeIndicator` (global) is unchanged.
- **`isLiveModeEnabled()` / the mock-mode-first convention** — unchanged. This WP makes the live path *authenticate*; it does not change the gate or the MOCK default.
- **WebSocket auth** (`VITE_WS_URL`) — the LIVE fetchers are HTTP GET only; any dashboard WS path is untouched.
- **Token-refresh beyond the broker's own lifecycle** — mirror arena-client's posture; no bespoke refresh loop.
- **The hardcoded-mock surfaces** (KPI / players / billing / monetization) — they re-export `mockX` ungated and stay MOCK regardless; not touched.

## Files Expected to Change

**Dashboard source/test (`apps/dashboard/`):**
- `package.json` — **modified** — add `@teamhanko/hanko-elements` (version-matched to arena-client).
- `src/auth/hankoClient.ts` — **new** — Hanko wrapper (ported from arena-client).
- `src/auth/hankoClient.test.ts` — **new** — wrapper tests (`__hankoFactory` seam).
- `src/stores/auth.ts` — **modified** — real token store (token / setSession / clearSession / bootstrapFromCachedToken / isAuthenticated).
- `src/stores/auth.test.ts` — **new/modified** — token-lifecycle tests.
- `src/App.vue` — **modified** — Hanko init + session subscription → store.
- `src/pages/auth/LoginPage.vue` — **modified** — `<hanko-auth :api>`; drop the mock form.
- `src/services/authToken.ts` — **new** — the live-fetch auth seam: `registerAuthTokenReader` + `readAuthToken` + `buildLiveRequestOptions(token)` + `handleMissingAuthToken(cacheRef, warnOnceSet)` + `__testHooks.setAuthToken`. **Implement before editing the fetchers.**
- `src/services/authToken.test.ts` — **new** — reader-registration (pre/post), builder, and missing-token-handler tests.
- `src/services/analyticsLiveFetchers.ts` — **modified** — Bearer header; drop cookie; D-24003 comment.
- `src/services/analyticsLiveFetchers.test.ts` — **modified** — assert Bearer; no cookie; null-token path.
- `src/services/sweepLiveFetchers.ts` — **modified** — Bearer header; drop cookie.
- `src/services/sweepLiveFetchers.test.ts` — **modified** — assert Bearer; null-token path.
- `src/services/triageLiveFetchers.ts` — **modified** — Bearer header; drop cookie.
- `src/services/triageLiveFetchers.test.ts` — **modified** — assert Bearer; null-token path.
- `src/types/index.ts` — **modified** — retire the mock role surface to identity-only.
- `.env.example` — **modified** — add `VITE_HANKO_TENANT_BASE_URL`; fix `VITE_API_BASE_URL`.

**Governance (`docs/`):**
- `docs/ai/STATUS.md` — **modified** — Done entry naming WP-241.
- `docs/ai/DECISIONS.md` — **modified** — D-24003, D-24004, D-24005 (Active at close).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-241 checked off + date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-272 → Done.
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — WP-241 node.

~22 files (17 App source/test + 5 governance). **Exceeds the lint §5 ~8-file
guideline — operator-authorised** (one cohesive auth cutover; the login, store,
wrapper, token accessor, and the three fetcher edits are one change; mirrors the
WP-236 21-file / WP-239 15-file precedent). **May split** into WP-241a (auth
foundation: A–D + G-types + env + their tests) + WP-241b (Bearer fetcher cutover:
E–F + fetcher tests + supersede D-20601), 241b depending on 241a, if a smaller
session is preferred.

## Locked Contract Values

- **Hanko tenant env var:** `VITE_HANKO_TENANT_BASE_URL` — the tenant origin passed to `<hanko-auth :api>` and `initializeHankoClient({ tenantBaseUrl })`; identical name to the arena-client + the server's `HANKO_TENANT_BASE_URL`. No new gate semantics.
- **Correct API base:** `VITE_API_BASE_URL = https://api.legendary-arena.com` (production; no `/api` suffix — fetchers append `/api/...`). Local-dev default corrected to `http://localhost:3001`.
- **Auth-store contract (mirror WP-160):** `token: Ref<string | null>`; `isAuthenticated = token !== null`; `setSession` / `clearSession` / `bootstrapFromCachedToken` (null-cached-token never clobbers a set session, D-16003 guard).
- **Token attachment (D-24003, supersedes D-20601):** outbound LIVE-fetch headers are `{ Accept: 'application/json', Authorization: \`Bearer ${token}\` }` when `readAuthToken()` is non-null; `credentials: 'include'` is REMOVED from all three fetchers. Null token ⇒ fail-silent (no request, prior cache/sentinel preserved, one-shot DEV warn).
- **`isLiveModeEnabled()` gate:** unchanged (`VITE_USE_MOCKS !== 'true'` AND non-empty `VITE_API_BASE_URL`). The env flip remains an operator deploy action.
- **Server:** untouched. Bearer-only `requireAuthenticatedSession` (D-11202) is the contract complied with; no admin-scoping added (D-24004).
- **Layer:** `apps/dashboard` only; no import from `apps/arena-client`/`apps/server`/engine (the Hanko wrapper + store are local copies).
- **Token-reader registration (hardening):** `registerAuthTokenReader(fn)` is called **once** from `App.vue` after Pinia is created; `readAuthToken()` returns the registered reader's value (or `null` before registration / in tests). No `useAuthStore()` inside a plain module — registration removes the Pinia-timing false-null risk.
- **Single live-request seam (drift-proof):** `buildLiveRequestOptions(token)` is the SOLE producer of live-fetch headers and `handleMissingAuthToken(cacheRef, warnOnceSet)` the SOLE fail-silent path; all three fetchers call them — no per-file header/skip logic.
- **Fail-silent contract (uniform across all three):** token `null` ⇒ `fetch` is NOT invoked, the prior `cacheRef.value` (cache/sentinel) is returned unchanged, and a one-shot DEV `console.warn` fires (keyed in the fetcher's `warnOnce` set).
- **Hanko init idempotency:** initialization + subscription run at most once; repeat mounts MUST NOT re-init or re-subscribe (a `hankoInitialized` guard) — no duplicate `setSession`/`clearSession` callbacks.
- **Token-storage invariant:** the session token lives ONLY in the Pinia auth store; no other module caches or copies it (fetchers read it live via `readAuthToken()`).

## Acceptance Criteria

1. `apps/dashboard/src/auth/hankoClient.ts` exports `initializeHankoClient` + `subscribeToSessionEvents` + `HankoInitializationFailed` + a `__hankoFactory` seam, and imports nothing from `apps/arena-client`/`apps/server`/engine.
2. `stores/auth.ts` exposes `token` / `isAuthenticated` / `setSession` / `clearSession` / `bootstrapFromCachedToken`; the mock `login(AuthUser)` surface is gone; the null-cached-token guard is tested.
3. `App.vue` initializes Hanko from `VITE_HANKO_TENANT_BASE_URL`, subscribes, and routes session → `setSession`; an empty/failed tenant falls back to the LoginPage without throwing.
4. `LoginPage.vue` renders `<hanko-auth :api="tenantBaseUrl">` and no longer contains the mock email/role form or the "any email accepted" note.
5. For EACH of the three LIVE fetchers, fetch-spy tests prove ALL of: (a) when `readAuthToken()` is non-null, the issued request carries `Authorization: Bearer <token>`; (b) the file contains no `credentials: 'include'`; (c) when the token is `null`, `fetch` is NOT invoked AND the prior cache/sentinel is returned unchanged (a dedicated negative-path test per fetcher).
6. `mocks.ts` and `isLiveModeEnabled()` are unchanged; MOCK remains the default; the hardcoded-mock surfaces are byte-identical.
7. `.env.example` lists `VITE_HANKO_TENANT_BASE_URL` and a corrected `VITE_API_BASE_URL`.
8. No `apps/server`/engine/registry/migration file changed (`git diff` empty for those trees).
9. `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 (no new error vs baseline).
10. `pnpm --filter @legendary-arena/dashboard test` exits 0 (net-new auth + bearer tests; pre-existing green).
11. `pnpm --filter @legendary-arena/dashboard build` exits 0.
12. `@teamhanko/hanko-elements` appears in `apps/dashboard/package.json` dependencies (not devDependencies).

## Verification Steps

```pwsh
# 1. Hanko wrapper present, layer-safe
Select-String -Path "apps/dashboard/src/auth/hankoClient.ts" -Pattern "initializeHankoClient","subscribeToSessionEvents","__hankoFactory"
(Select-String -Path "apps/dashboard/src/auth/hankoClient.ts","apps/dashboard/src/stores/auth.ts" -Pattern "apps/arena-client","apps/server","@legendary-arena/game-engine").Count   # Expected: 0

# 2. Bearer header centralized in authToken.ts; the three fetchers delegate; cookie gone.
# why: grep the SHARED seam for presence + the fetchers for delegation — NOT a bare
# "Authorization" absence in the fetchers (their // why: comment names it, which would
# self-trip the grep per §18 / the grep-gate-comment pattern).
Select-String -Path "apps/dashboard/src/services/authToken.ts" -Pattern "buildLiveRequestOptions","handleMissingAuthToken","registerAuthTokenReader"   # Expected: all match (the sole seam)
(Select-String -Path "apps/dashboard/src/services/analyticsLiveFetchers.ts","apps/dashboard/src/services/sweepLiveFetchers.ts","apps/dashboard/src/services/triageLiveFetchers.ts" -Pattern "buildLiveRequestOptions").Count   # Expected: 3 (each fetcher delegates; no per-file header literal)
(Select-String -Path "apps/dashboard/src/services/analyticsLiveFetchers.ts","apps/dashboard/src/services/sweepLiveFetchers.ts","apps/dashboard/src/services/triageLiveFetchers.ts" -Pattern "credentials: 'include'").Count   # Expected: 0

# 3. Real login — no mock form
(Select-String -Path "apps/dashboard/src/pages/auth/LoginPage.vue" -Pattern "any email|mockUser|selectedRole").Count   # Expected: 0
Select-String -Path "apps/dashboard/src/pages/auth/LoginPage.vue" -Pattern "hanko-auth"   # Expected: 1 match

# 4. Env var added
Select-String -Path "apps/dashboard/.env.example" -Pattern "VITE_HANKO_TENANT_BASE_URL"   # Expected: 1 match

# 5. Server/engine untouched
git diff --stat -- apps/server packages
# Expected: no output

# 6. Build / test / typecheck
pnpm --filter @legendary-arena/dashboard typecheck   # exit 0, no new error vs baseline
pnpm --filter @legendary-arena/dashboard test        # exit 0, auth+bearer tests added
pnpm --filter @legendary-arena/dashboard build       # exit 0
```

**Operator cutover (post-merge, NOT a repo change):** in the Cloudflare Pages
`legendary-arena-dashboard` project → Variables: set `VITE_HANKO_TENANT_BASE_URL`
(the same tenant origin the game uses), set `VITE_API_BASE_URL=https://api.legendary-arena.com`,
set `VITE_USE_MOCKS=false`, then **trigger a redeploy** (VITE vars are build-time
inlined). Confirm the dashboard prompts a Hanko login and the `/pipeline` + `/system`
panels render real data (or the empty state if the backends have no rows yet).

## Definition of Done

- [ ] All 12 Acceptance Criteria pass
- [ ] All Verification Steps produce the expected output
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (net-new auth/bearer tests; pre-existing green)
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 — no new error vs baseline
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] No `apps/server`/engine/registry/migration change (`git diff` empty for those trees)
- [ ] `mocks.ts` + `isLiveModeEnabled()` unchanged; hardcoded-mock surfaces byte-identical
- [ ] Governance updated: `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-24003/D-24004/D-24005 Active), `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md`, `docs/05-ROADMAP-MINDMAP.md`
- [ ] No files outside `## Files Expected to Change` were modified

## Vision Alignment

**Vision clauses touched:** §3 (Trust & Fairness — identity/auth), and the
identity/account surface generally. **Conflict assertion:** `No conflict: this WP
preserves all touched clauses.` It replaces a fake operator login with real Hanko
identity, strengthening trust; it adds no scoring/PAR/replay/RNG/determinism
surface and no card data. **Non-Goal proximity:** None of NG-1..7 crossed — this is
operator-tool authentication, not a paid/persuasive/competitive surface, and adds
no monetization (NG-1 untouched). **Determinism preservation:** N/A — WP touches no
determinism-bearing surface (client auth, outside the engine boundary).

## Funding Surface Gate

**N/A.** No global-nav / registry-viewer / profile funding affordance, no funding
copy, no funding-channel integration (WP-097 G-1..G-7 untouched). Operator-only
admin dashboard auth.

## API Catalog Update

**N/A.** No HTTP endpoint and no `apps/server/src/**` library function is added,
modified, removed, or status-changed. The consumed endpoints
(`/api/{sweep,inspection,handoffs}/latest`, analytics GETs) already exist and are
catalogued `authenticated-session-required` (their Auth column already names the
bearer session — this WP makes the client comply). Per §21.4, N/A with justification.

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-12:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present; Out of Scope lists 8 exclusions (server, admin-scoping, env-flip op-action, per-widget indicator, isLiveModeEnabled, WS auth, token-refresh, hardcoded-mock surfaces) |
| 2 | PASS | ESM/Node v22/`node:`/full-file/human-style per 00.6; locked values explicit |
| 3 | PASS | `## Assumes` cites every mirrored arena-client file + every touched dashboard file with exact exports; BLOCKED clause present |
| 4 | PASS | Context cites the auth-gap audit, D-20601/D-11202, WP-126/160 patterns, ARCHITECTURE Layer Boundary; rejected-alternatives recorded |
| 5 | CONDITIONAL PASS | ~22 files (>~8) — operator-authorised cohesive auth cutover; documented WP-241a/b split seam; each file has a disposition |
| 6 | PASS | `VITE_HANKO_TENANT_BASE_URL` / `Authorization: Bearer` / store member names match the arena-client + server contracts exactly (verified against source) |
| 7 | PASS | One new dep `@teamhanko/hanko-elements` — already a vetted arena-client dependency, version-matched; justified (the auth broker) |
| 8 | PASS | Dashboard-only; no `apps/server`/engine import; local copies of the Hanko wrapper + store per the layer boundary |
| 9 | PASS | PowerShell `Select-String` greps; Windows paths |
| 10 | PASS | New env var introduced (`VITE_HANKO_TENANT_BASE_URL`) is documented in `.env.example`; no secret value committed (tenant URL is public config; provisioned in CF Pages) |
| 11 | PASS | Real auth model change — the WP's core; complies with the shipped WP-112 bearer contract; supersedes D-20601 with a recorded D-entry (D-24003) |
| 12 | PASS | `node:test`/`node:assert` only; `__hankoFactory`/`__testHooks` seams keep tests broker-free + network-free; no boardgame.io |
| 13 | PASS | Exact `pnpm --filter` commands + the operator-cutover steps with expected output |
| 14 | PASS | 12 binary, observable acceptance criteria aligned to deliverables |
| 15 | PASS | DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/ROADMAP + scope-boundary check |
| 16 | PASS | Human-style: mirror existing pattern (no premature shared-package abstraction — duplicate at 2nd copy per Rule 1), explicit, JSDoc, `// why:` on the bearer rationale |
| 17 | PASS (light) | Touches §3 identity/trust; `## Vision Alignment` block present; no scoring/replay/RNG/card-data/monetization surface |
| 18 | PASS | After centralizing the header builder, Verification Step 2 greps the SHARED seam (`buildLiveRequestOptions`/`handleMissingAuthToken`) for presence + the fetchers for delegation — NOT a bare `Authorization` absence in the fetchers, whose `// why:` comment names it (the §18 grep-gate-comment self-trip, pre-empted). The `credentials: 'include'` absence grep is safe (the comment says "cookies", not the literal); `any email`/`hanko-auth` greps unaffected |
| 19 | N/A | Not a repo-state-summarizing artifact |
| 20 | N/A | No funding surface (see Funding Surface Gate) |
| 21 | N/A | No endpoint/library-function surface touched (see API Catalog Update) |

Reserved decisions (Active at close): **D-24003** — dashboard→API auth is a real
Hanko bearer token (`Authorization: Bearer`), mirroring the arena-client WP-126/160
pattern; **supersedes D-20601's cookie-credentials posture** for the dashboard LIVE
fetchers (the cookie path never worked against the bearer-only server, D-11202).
**D-24004** — admin role-scoping of the dashboard endpoints is explicitly DEFERRED;
endpoints stay `authenticated-session-required` and the Cloudflare Access gate
(WP-197) is the operator-reachability boundary; a server-side role enforcement is a
follow-up WP. **D-24005** — the dashboard auth token lives in the Pinia store
(mirroring WP-160) and the plain-module LIVE fetchers read it via an injectable
`readAuthToken()` accessor (parity with the `readEnv()` seam), keeping the fetchers
decoupled from Vue/Pinia and test-injectable. The reader is wired by an explicit
`registerAuthTokenReader(fn)` called once from `App.vue` after Pinia is created (no
implicit `useAuthStore()` in a plain module — removes the Pinia-timing false-null
risk); `buildLiveRequestOptions(token)` + `handleMissingAuthToken(cacheRef, warnOnceSet)`
in the same module are the single drift-proof header-builder + fail-silent seam used
by all three fetchers, and Hanko init/subscription is idempotent (a `hankoInitialized`
guard).
