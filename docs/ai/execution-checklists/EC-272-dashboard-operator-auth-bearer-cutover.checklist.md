# EC-272 — Dashboard Operator Auth + Bearer Cutover (Execution Checklist)

**Source:** docs/ai/work-packets/WP-241-dashboard-operator-auth-bearer-cutover.md
**Layer:** Dashboard (`apps/dashboard/**`) only — no server/engine/registry/migration change.

> Use locked values from WP-241 verbatim. EC-272 is the operational order + gates +
> failure smells; if EC-272 and WP-241 conflict, WP-241 wins.

## Before Starting

- [ ] Read the three arena-client templates ENTIRELY — `src/auth/hankoClient.ts`, `src/stores/auth.ts` (WP-160), `src/App.vue` + `src/pages/LoginPage.vue` (Hanko init + `<hanko-auth :api>`) + `src/lib/api/billingApi.ts` (the `Authorization: Bearer ${authToken}` attach). The dashboard MIRRORS these; it MUST NOT import from `apps/arena-client`.
- [ ] Confirm the dashboard's current state: mock `stores/auth.ts` + `pages/auth/LoginPage.vue`; the three `*LiveFetchers.ts` each with `const FETCH_OPTIONS = { credentials: 'include', headers: { Accept } }`; `.env.example` has no Hanko var.
- [ ] Confirm `requireAuthenticatedSession` is bearer-only (D-11202) and the `dashboard.legendary-arena.com` CORS origin is already allowlisted — NO server change in this WP.
- [ ] **Baseline (paste into the session log):** `pnpm --filter @legendary-arena/dashboard test` pass/fail; `… typecheck` (`vue-tsc --noEmit`) exit + any pre-existing errors; `… build` exit.
- [ ] Read WP-241 §Goal, §Session Context, §Scope (In/Out), §Locked Contract Values, §Acceptance Criteria.

## Locked Values (verbatim from WP-241 — do not re-derive)

- Hanko env var: `VITE_HANKO_TENANT_BASE_URL` (same name as arena-client + server `HANKO_TENANT_BASE_URL`); passed to `<hanko-auth :api>` + `initializeHankoClient({ tenantBaseUrl })`.
- Correct API base: `https://api.legendary-arena.com` (no `/api` suffix); local default corrected to `http://localhost:3001`.
- Auth store (mirror WP-160): `token: Ref<string|null>`; `isAuthenticated = token !== null`; `setSession` / `clearSession` / `bootstrapFromCachedToken` (null cached token never clobbers a set session — D-16003 guard).
- Token attachment (D-24003, supersedes D-20601): headers `{ Accept: 'application/json', Authorization: \`Bearer ${token}\` }` when `readAuthToken()` non-null; `credentials: 'include'` REMOVED from all three fetchers. Null token ⇒ fail-silent (no request, cache/sentinel preserved, one-shot DEV warn).
- `isLiveModeEnabled()` unchanged; the env flip is an operator deploy action, not a code change.
- Server untouched (D-11202 bearer-only complied with; no admin-scoping — D-24004).

## Guardrails

- **App layer only.** Touch only `apps/dashboard/**` + the 5 governance files. No `apps/server`/engine/registry/migration edit. The Hanko wrapper + store are LOCAL copies — never import `apps/arena-client`.
- **One new dep only:** `@teamhanko/hanko-elements` (version-match arena-client), in `dependencies` (not devDependencies).
- **Drop the cookie everywhere.** After this WP, `Select-String *LiveFetchers.ts -Pattern "credentials: 'include'"` must be 0. The bearer header replaces it.
- **Token read at fetch time, fail-silent on null.** `readAuthToken()` is the injectable accessor (parity with `readEnv()`); a null token is the missing-credential case — skip the request, keep prior cache, one-shot DEV warn. Never throw to the widget.
- **Fetcher contracts byte-stable otherwise.** Synchronous getter, cached-`Ref`, object-envelope guard, single-request dedup, signature — all unchanged. Only `FETCH_OPTIONS` → bearer builder changes.
- **No mock login residue.** `LoginPage.vue` must lose the email/role form + "any email accepted" note; `stores/auth.ts` must lose `login(AuthUser)`. The router guard keeps gating on `isAuthenticated` (now token-derived).
- **Roles are out of scope (D-24004).** Remove the mock role dropdown; do NOT add server-side role enforcement; do NOT gate widgets on role.
- **`mocks.ts` / `isLiveModeEnabled()` frozen.** MOCK stays the default; the hardcoded-mock surfaces (KPI/players/billing/monetization) end byte-identical.
- **Broker-free tests.** Use the `__hankoFactory` + `__testHooks.setAuthToken` seams; no real Hanko network, no boardgame.io.
- **`typecheck` is a DoD gate.** `vue-tsc --noEmit` explicitly; add no new error.

## Required `// why:` Comments

- `hankoClient.ts` — why the wrapper is a local copy, not an import from `apps/arena-client` (layer boundary; duplicate-at-2nd-copy per 00.6 Rule 1).
- `stores/auth.ts` — why `bootstrapFromCachedToken` guards against a null cached token clobbering a set session (D-16003).
- `authToken.ts` — why the fetchers read the token via an injectable accessor, not `useAuthStore()` directly (plain-module decoupling + test seam; D-24005).
- `*LiveFetchers.ts` (D-24003) — why `Authorization: Bearer` replaces `credentials: 'include'` (server is bearer-only, D-11202; supersedes D-20601's cookie posture that never worked live).
- `App.vue` — why an empty/unreachable `VITE_HANKO_TENANT_BASE_URL` falls back to the LoginPage instead of throwing (test/dev/unconfigured).

## Files to Produce

- `apps/dashboard/package.json` — **modified** — add `@teamhanko/hanko-elements`.
- `apps/dashboard/src/auth/hankoClient.ts` (+ `.test.ts`) — **new** — Hanko wrapper + `__hankoFactory` tests.
- `apps/dashboard/src/stores/auth.ts` (+ `.test.ts`) — **modified/new** — real token store + tests.
- `apps/dashboard/src/App.vue` — **modified** — Hanko init + session → store.
- `apps/dashboard/src/pages/auth/LoginPage.vue` — **modified** — `<hanko-auth :api>`; drop mock form.
- `apps/dashboard/src/services/authToken.ts` — **new** — `readAuthToken()` + `__testHooks`.
- `apps/dashboard/src/services/{analytics,sweep,triage}LiveFetchers.ts` (+ their `.test.ts`) — **modified** — Bearer; drop cookie; assert in tests.
- `apps/dashboard/src/types/index.ts` — **modified** — retire mock role surface.
- `apps/dashboard/.env.example` — **modified** — add `VITE_HANKO_TENANT_BASE_URL`; fix `VITE_API_BASE_URL`.
- `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-24003..D-24005), `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md`, `docs/05-ROADMAP-MINDMAP.md` — **modified** — governance.

~21 files: 16 App source/test + 5 governance. (Operator-authorised >~8; may split WP-241a/b — see WP-241 §Files.)

## After Completing

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] `… test` exits 0; net-new auth + bearer tests; pre-existing green.
- [ ] `… typecheck` exits 0; no new error vs baseline.
- [ ] `Select-String hankoClient.ts -Pattern "initializeHankoClient","subscribeToSessionEvents","__hankoFactory"` → all match.
- [ ] `(Select-String hankoClient.ts,stores/auth.ts -Pattern "apps/arena-client","apps/server").Count` → 0.
- [ ] `(Select-String {analytics,sweep,triage}LiveFetchers.ts -Pattern "credentials: 'include'").Count` → 0; `Authorization` present in each.
- [ ] `(Select-String LoginPage.vue -Pattern "any email|mockUser|selectedRole").Count` → 0; `hanko-auth` present.
- [ ] `Select-String .env.example -Pattern "VITE_HANKO_TENANT_BASE_URL"` → 1.
- [ ] `git diff --stat apps/server packages` → no output.
- [ ] `mocks.ts` + `isLiveModeEnabled()` `git diff` empty.
- [ ] `docs/ai/STATUS.md` / `DECISIONS.md` (D-24003..05 Active) / `WORK_INDEX.md` (WP-241 ✅ + date) / `EC_INDEX.md` (EC-272 → Done) / `05-ROADMAP-MINDMAP.md` updated.

## Common Failure Smells

- Importing `apps/arena-client/src/auth/hankoClient.ts` "to reuse it" → layer violation. Copy it locally; guard with the grep.
- Leaving `credentials: 'include'` alongside the bearer header → the server ignores the cookie; the leftover signals the cutover is half-done. Remove it.
- Reading `useAuthStore()` inside the plain-module fetcher → Pinia-outside-setup pitfalls + untestable. Use the `readAuthToken()` accessor seam.
- Throwing when the token is null → blanks the panel. Treat null token like the missing-URL case: fail-silent, prior cache, one-shot warn.
- Keeping the mock role dropdown / `AuthUser` "any email" form → the login is still fake. It must be `<hanko-auth>` only.
- Adding server-side role checks "while I'm here" → out of scope (D-24004); that's a server change + a follow-up WP.
- Touching `mocks.ts` / `isLiveModeEnabled()` → the gate is frozen; this WP only changes how the live path authenticates.
- Forgetting the redeploy after the operator sets the CF Pages vars → `VITE_*` are build-time inlined; a settings save alone does nothing.

## DECISIONS.md Entries (D-24003..D-24005)

Reserved in docs/ai/DECISIONS.md (Reserved (proposed) at draft → Active at close):
**D-24003** — Dashboard→API auth is a real Hanko bearer token (`Authorization: Bearer`), mirroring the arena-client WP-126/160 pattern; **supersedes D-20601's cookie-credentials posture** for the dashboard LIVE fetchers (the cookie path never worked against the bearer-only server, D-11202).
**D-24004** — Admin role-scoping of the dashboard endpoints is explicitly DEFERRED; endpoints stay `authenticated-session-required`, with the Cloudflare Access gate (WP-197) as the operator-reachability boundary; server-side role enforcement is a follow-up WP.
**D-24005** — The dashboard auth token lives in the Pinia store (mirroring WP-160); the plain-module LIVE fetchers read it via an injectable `readAuthToken()` accessor (parity with `readEnv()`), keeping the fetchers decoupled from Vue/Pinia and test-injectable.
