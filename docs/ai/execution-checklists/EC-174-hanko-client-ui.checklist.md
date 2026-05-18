# EC-174 — Hanko Client UI (Execution Checklist)

**Source:** docs/ai/work-packets/WP-160-hanko-client-ui.md
**Layer:** App / Client (`apps/arena-client/**`) + governance (`docs/ai/work-packets/`, `docs/ai/execution-checklists/`, `docs/05-ROADMAP-MINDMAP.md`, `docs/ai/DECISIONS.md`)

## Before Starting
- [ ] WP-099 / WP-101 / WP-104 / WP-106 / WP-108 / WP-112 / WP-126 / WP-131 / WP-132 / WP-133 / WP-052 / WP-090 marked `[x]` in WORK_INDEX
- [ ] `git rev-parse origin/main` matches the line-number-pinning baseline `295eec6` (the WP body's line references); if HEAD has moved, re-verify the four cited line ranges (`App.vue:49`, `App.vue:83-108`, `App.vue:110-140`, `MyProfilePage.vue:121-132`) before patching
- [ ] `apps/arena-client/src/main.ts:9` bootstraps Pinia via `createPinia()` + `app.use(pinia)`
- [ ] `apps/arena-client/src/App.vue:49` declares `AppRoute` as a closed-set union of 6 values (`'fixture' | 'live' | 'lobby' | 'profile' | 'me' | 'admin-billing'`)
- [ ] `apps/arena-client/src/pages/MyProfilePage.vue:121-132` defines `readAuthToken()` reading from `window.localStorage.getItem('authToken')`
- [ ] `apps/arena-client/src/lib/api/ownerProfileApi.ts` accepts `authToken: string | null` in `fetchOwnerProfile` / `updateOwnerProfile` / `replaceOwnerLinks` (lines 107, 132, 162)
- [ ] `apps/arena-client/.env.example` documents `VITE_SERVER_URL` (the precedent we mirror)
- [ ] `apps/arena-client/vite.config.ts:22-42` exports `failOnNodeExternalization` (the D-14401 boundary guard)
- [ ] `pnpm install` && `pnpm -r build` exit 0 (baseline)
- [ ] `pnpm --filter @legendary-arena/arena-client test` baseline captured (record the number before adding +15 new tests)
- [ ] `@teamhanko/hanko-elements @ ^2.4.0` is published on npm and resolvable via `npm view @teamhanko/hanko-elements@^2.4.0 version`
- [ ] Render production env has `HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE` set (operational; cite render.yaml:54-60 — set in the Render dashboard manually)

## Locked Values (do not re-derive)
- **NPM dep (verbatim):** `"@teamhanko/hanko-elements": "^2.4.0"` under `dependencies` (NOT `devDependencies`)
- **Client env var name:** `VITE_HANKO_TENANT_BASE_URL` (mirrors server `HANKO_TENANT_BASE_URL`)
- **New route value (added to closed-set):** `'login'`
- **Route guard scope (closed set, 2 values):** `'me'`, `'admin-billing'`. All other route values are unguarded.
- **Discrimination precedence (extended):** `admin-billing > me > login > profile > fixture > live > lobby`
- **New URL query param:** `returnTo` (single value; validated against `'me' | 'admin-billing'`; invalid → falls back to lobby on sign-in success)
- **Pinia store id:** `'auth'`
- **Pinia state shape:** `{ token: string | null, accountId: string | null, isAuthenticated: ComputedRef<boolean> }`
- **Pinia actions:** `setSession(token: string, accountId: string | null): void`, `clearSession(): void`, `bootstrapFromCachedToken(token: string | null): void`
- **`isAuthenticated`:** MUST be `computed(() => token.value !== null)`. NEVER a separately-settable ref.
- **Hanko wrapper exports (exact 7):** `initializeHankoClient`, `getCurrentTokenFromHandle`, `signOutCurrentSession`, `subscribeToSessionEvents`, type `HankoClientHandle`, interface `HankoSessionListeners`, class `HankoInitializationFailed`
- **Wrapper test seam:** `HankoClientInitOptions.__hankoFactory?: (tenantUrl, options) => Promise<HankoLike>` — double-underscore prefix marks it as a test-only seam; production callers omit it
- **LoginPage visual states (closed set, 4 values):** `'initializing' | 'ready' | 'unavailable' | 'signing-out'`
- **LoginPage failure-banner copy (verbatim — exact-string assertion in tests if applicable):** `"Sign-in is temporarily unavailable. Please try again later."`
- **LoginPage preparing-banner copy (verbatim):** `"Preparing sign-in…"`
- **LoginPage page-header copy (verbatim):** `"Sign in to Legendary Arena"`
- **MyProfilePage sign-out button label (verbatim):** `"Sign out"`
- **Console log prefix for auth events:** `[auth]` (single token, no trailing colon)
- **Sign-in success fallback route:** `?route=` (lobby) when `returnTo` is absent or not in the guarded-route closed set
- **Sign-out navigation target:** `?route=` (lobby)
- **`sessionCheckInterval` default:** unset (defer to Hanko default 30000ms)
- **Decisions reserved:** D-16001 (widget choice), D-16002 (token storage), D-16003 (attachment), D-16004 (sign-out semantics), D-16005 (expiry handling), D-16006 (auto-provisioning), D-16007 (route guard scope), D-16008 (sign-in surface placement), D-16009 (failure modes), D-16010 (build-time config), D-16011 (cross-repo boundary)

## Guardrails
- **Broker invisibility (F-1).** The literal string `'hanko'` (any quote style) MUST NOT appear in any new client source file as an `auth_provider` enum value, store-key value, fixture value, or stored-string value. Permitted appearances: (a) the `@teamhanko/hanko-elements` import path, (b) the env var name `VITE_HANKO_TENANT_BASE_URL`, (c) JSDoc / `// why:` prose that paraphrases the broker per §18. Verification grep at execution close MUST return zero matches outside the permitted contexts.
- **Broker confinement (F-2).** Every `@teamhanko/*` import MUST live in `apps/arena-client/src/auth/hankoClient.ts`. The test file `hankoClient.test.ts` MUST NOT import `@teamhanko/*` (it uses the `__hankoFactory` seam and constructs a fake `HankoLike` object). The Pinia auth store, the LoginPage, the App.vue, and `MyProfilePage.vue` MUST NOT import `@teamhanko/*` directly. Grep gate: `grep -rn "from '@teamhanko/" apps/arena-client/src --include="*.ts" --include="*.vue" | grep -v "auth/hankoClient.ts$"` returns zero matches.
- **Auth store is broker-agnostic.** `apps/arena-client/src/stores/auth.ts` MUST NOT import `@teamhanko/*` AND MUST NOT mention the broker in any prose. The store stores `string | null` and `boolean` only — no broker-specific types. Grep gate: `grep -n "hanko\|@teamhanko" apps/arena-client/src/stores/auth.ts` returns zero matches.
- **LoginPage does not import the SDK directly.** The page consumes the wrapper. Grep gate: `grep -n "from '@teamhanko/" apps/arena-client/src/pages/LoginPage.vue` returns zero matches.
- **isAuthenticated is derived, not assignable.** The Pinia store MUST expose `isAuthenticated` as `ComputedRef<boolean>` (NOT `Ref<boolean>`). If a test tries `store.isAuthenticated = true`, TypeScript compile must reject. The store body MUST contain `computed(() => token.value !== null)` (or the structurally-identical `computed(() => state.token !== null)` depending on which Pinia style is used).
- **Token storage is broker-owned.** The wrapper MUST NOT directly write to `localStorage`, `sessionStorage`, or `document.cookie`. Token persistence is delegated entirely to the Hanko SDK's `storageKey` setting. Grep gate inside `hankoClient.ts`: zero matches for `localStorage`, `sessionStorage`, `document.cookie`.
- **No mutation of bystander state by the wrapper.** The wrapper's four exported functions MUST NOT mutate any global, any module-level cache, or any DOM element outside the Hanko SDK's own. The factory pattern keeps the SDK instance as a closure-captured value inside `HankoClientHandle`.
- **Single-source for the auth token.** The Pinia store's `token` field is the canonical client-side source of truth for the bearer token. `MyProfilePage.vue` reads from the store; `BillingSection.vue` receives the token as a prop from `MyProfilePage.vue` (no change to BillingSection). No file MAY add a new direct read of the Hanko cookie or call `hanko.getSessionToken()` outside the wrapper.
- **Closed-set discipline on routes.** The `AppRoute` union MUST be extended by exactly one value (`'login'`). Adding `'logout'` or `'signup'` or any other discriminator is OUT OF SCOPE. The discrimination precedence in `selectRoute` MUST place `'login'` between `me` and `profile` (precedence `admin-billing > me > login > profile > fixture > live > lobby`).
- **Route guard is one-shot at setup time.** App.vue's route guard MUTATES the local `route` value once at setup — it does NOT install a reactive watch. The user's URL bar at first render still reads `?route=me`; only the rendered component differs. After the user signs in, the LoginPage navigates via `window.location.assign(...)` which re-runs setup.
- **Fail-safe sign-out.** `MyProfilePage.signOut()` MUST clear the local store and navigate to lobby EVEN IF the broker logout call rejects. The broker logout failure path is intentionally silenced (a stuck sign-in state is worse than a stale-cookie state) and documented with a `// why:` comment.
- **No `Math.random()`, no `Date.now()`, no `performance.now()`, no `new Date(` in `hankoClient.ts` or `auth.ts`.** Grep gate.
- **No `axios`, no `node-fetch`.** Built-in `fetch` only (used by the existing API clients which this WP does not modify).
- **No new dev dependencies.** Only `@teamhanko/hanko-elements` under `dependencies`.
- **Build boundary preserved (D-14401).** The Vite `failOnNodeExternalization` guard at `vite.config.ts:22` MUST remain green after the dep addition. If `pnpm --filter @legendary-arena/arena-client build` throws `Boundary Leakage detected (D-14401)`, STOP — the dep introduces a `node:*` import into the browser bundle, and the WP scope must be re-opened.
- **Test isolation.** `hankoClient.test.ts` MUST NOT load the real `@teamhanko/hanko-elements` package. Use `__hankoFactory` to inject a fake `HankoLike` object exposing the methods the wrapper calls (`getSessionToken`, `user.logout`, `onSessionCreated`, `onSessionExpired`, `onUserLoggedOut`). The test file MAY use `import type` for the `HankoLike` shape if the wrapper exports it; runtime import of the real package is FORBIDDEN.
- **Locked-file boundary.** Zero modifications outside `apps/arena-client/` + the four governance files (WORK_INDEX, EC_INDEX, ROADMAP-MINDMAP, DECISIONS). `git diff --stat -- 'apps/server/**' 'packages/**' 'data/**' 'docs/ai/REFERENCE/**'` MUST be empty.

## Required `// why:` Comments
- `hankoClient.ts` module header: cite WP-160, D-16001 (widget choice), D-16002 (token storage), D-16003 (attachment), and the broker-confinement discipline (this file is the ONLY runtime importer of `@teamhanko/*`)
- `hankoClient.ts` `initializeHankoClient` body: explain why the factory's rejection is wrapped in `HankoInitializationFailed` and the original error is intentionally NOT surfaced (no tenant URL or payload leak in `console.warn`)
- `hankoClient.ts` `subscribeToSessionEvents.onSessionCreated` callback: explain why we re-read `getSessionToken()` at fire time rather than parsing the event payload (broker event-shape stability is lower than the documented `getSessionToken()` API)
- `auth.ts` module header: cite WP-160 and D-16003 (the auth store is the canonical client-side source of truth for the bearer token)
- `auth.ts` `bootstrapFromCachedToken` body: explain the null-no-op behavior (a null cached token MUST NOT clobber a session that has already been set by an in-flight sign-in handshake)
- `LoginPage.vue` module header: cite WP-160 and D-16008 (sign-in surface placement at `?route=login`)
- `LoginPage.vue` `handleSignIn` navigation: explain why `window.location.assign(...)` is used over `history.pushState(...)` (full reload re-runs `App.vue` setup with the new route and triggers a fresh `initializeHankoClient` on the target guarded route)
- `LoginPage.vue` `returnTo` validation: explain the closed-set check (a stale query string with an arbitrary `returnTo` value MUST NOT navigate the user to an unknown route)
- `App.vue` route-guard mutation: explain that the local `route` mutation is one-shot at setup (NOT a reactive watch) and that the URL bar deliberately reads `?route=me` while the rendered page is `LoginPage`
- `MyProfilePage.vue` `readAuthToken()` replacement: cite WP-160 / D-16003 (token now sourced from the Pinia store, populated by the Hanko SDK wrapper at app bootstrap or sign-in)
- `MyProfilePage.vue` `signOut()` failure-silenced catch: explain why broker-logout rejection is silenced (a stuck sign-in state is worse than a stale-cookie state; the user navigates to lobby either way)
- `MyProfilePage.vue` `ensureHankoHandle()` memoization: explain why a module-scoped lazy initializer is the only acceptable in-app memoization (Hanko SDK initialization is expensive and idempotent; rebuilding per sign-out click would race with App.vue's bootstrap)
- `.env.example` `VITE_HANKO_TENANT_BASE_URL` entry: explain that the server's `HANKO_TENANT_BASE_URL` and the client's `VITE_HANKO_TENANT_BASE_URL` MUST point at the same Hanko tenant

> **Prose discipline reminder.** The literal `'hanko'` (single-quoted) MUST NOT appear in any new source file as a quoted enum value, store key, or fixture value. Paraphrase ("the authentication broker", "the configured identity provider") in JSDoc and `// why:` comments. The package name in imports (`@teamhanko/hanko-elements`) and the env var name (`VITE_HANKO_TENANT_BASE_URL`) are permitted under §18 because they are identifiers, not quoted strings, and the `'hanko'` grep gate at execution close excludes these contexts.

## Files to Produce
**New (5):**
- `apps/arena-client/src/auth/hankoClient.ts` — Hanko SDK wrapper (7 exports per Locked Values)
- `apps/arena-client/src/auth/hankoClient.test.ts` — 8 unit tests with `__hankoFactory` injection seam
- `apps/arena-client/src/stores/auth.ts` — Pinia auth store (3 state, 3 actions, `isAuthenticated` derived)
- `apps/arena-client/src/stores/auth.test.ts` — 7 unit tests (pure Pinia, no Hanko surface)
- `apps/arena-client/src/pages/LoginPage.vue` — sign-in page (four-state visual lifecycle)

**Modified (5):**
- `apps/arena-client/package.json` — add `@teamhanko/hanko-elements: ^2.4.0` under `dependencies`
- `apps/arena-client/.env.example` — add `VITE_HANKO_TENANT_BASE_URL` block (with the `// why:` comment per Required Comments)
- `apps/arena-client/src/App.vue` — extend `AppRoute` with `'login'`; add `loginRoute` + `returnTo` to `ParsedQuery`; route-guard logic; LoginPage slot
- `apps/arena-client/src/main.ts` — modified (likely byte-identical; if changed, document the diff in STATUS update with a one-sentence rationale)
- `apps/arena-client/src/pages/MyProfilePage.vue` — replace `readAuthToken()` localStorage read with `useAuthStore().token`; add "Sign out" button + handler; add `ensureHankoHandle()` lazy initializer

**Governance (4):**
- `docs/ai/work-packets/WORK_INDEX.md` — flip WP-160 to `[x]` with the post-execution one-line summary; update dependency-chain notes
- `docs/ai/execution-checklists/EC_INDEX.md` — flip EC-174 row to `Done <date>` with execution summary
- `docs/05-ROADMAP-MINDMAP.md` — flip WP-160 📝 → ✅ in Auth Stack & Profile Surface cluster; bump Progress Summary done count; refresh Last Updated footer
- `docs/ai/DECISIONS.md` — flip D-16001..D-16011 from "Drafted" to "Active"; populate full Decision / Rationale / Alternatives Rejected per the WP body §Open Design Decisions

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0 with no `Boundary Leakage detected` thrown
- [ ] `pnpm --filter @legendary-arena/arena-client test` baseline + 15 new tests pass; zero failures, zero unintended skips
- [ ] All §Verification Steps in WP-160 return their expected counts
- [ ] Repo-wide grep for `from '@teamhanko/` under `apps/arena-client/src` returns matches ONLY in `auth/hankoClient.ts`
- [ ] Repo-wide grep for `'hanko'|"hanko"` (quoted as a string) under `apps/arena-client/src` returns ZERO matches
- [ ] `git diff --stat -- 'apps/server/**' 'packages/**' 'data/**'` is empty (no engine/server/registry/migration touch)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` is byte-identical (no Auth taxonomy change; §21 N/A per WP body)
- [ ] `docs/ai/STATUS.md` updated with WP-160 completion note
- [ ] `docs/ai/DECISIONS.md` updated with D-16001..D-16011 (each entry: Decision, Rationale, Alternatives Rejected — at least 2 alternatives each)
- [ ] WORK_INDEX.md: WP-160 `[x]` with post-execution summary line referencing EC-174 + D-16001..D-16011 + the 5 unblocked WPs (WP-101, WP-104, WP-106, WP-108, WP-132/133)
- [ ] EC_INDEX.md: EC-174 row Status `Done <date>` with the same summary
- [ ] Roadmap mindmap: WP-160 ✅ on Auth Stack & Profile Surface cluster; Progress Summary `+1 done`; Last Updated footer current
- [ ] Commit message body declares `01.5 NOT INVOKED`
- [ ] 01.6 post-mortem authored (new long-lived abstraction: the Pinia auth store + Hanko SDK wrapper become the canonical client-side auth seam — capture rationale, open questions, field-test feedback)
- [ ] Manual smoke verification: deploy to a Cloudflare Pages preview with `VITE_HANKO_TENANT_BASE_URL` set; navigate to `?route=me` without a session → land on LoginPage; complete Hanko flow → land back on `?route=me` with `/api/me/profile` returning the owner-profile view; click "Sign out" → land on lobby with cleared store. (This is an operational verification, not a CI gate; document the result in STATUS update.)

## Common Failure Smells
- **"All tests pass but the production build hard-fails."** A Hanko transitive dep pulled a `node:*` import into the browser bundle. The Vite `failOnNodeExternalization` guard fires. Triage the transitive dep; if no fix, STOP and re-open WP framing (browser-only alternative dep, or scope reduction).
- **"`'hanko'` shows up in a grep."** Either a developer typed the broker name as a quoted enum value (F-1 violation) or a JSDoc paragraph enumerates the broker name verbatim (F-1 prose violation). Replace with a paraphrase ("the authentication broker") and a D-9901 citation.
- **"`@teamhanko/*` import in two files."** A developer imported the SDK into `LoginPage.vue` or `auth.ts` for "convenience". F-2 violation. Re-route through the wrapper.
- **"Store state has a separately-settable `isAuthenticated` boolean."** Two sources of truth; the test for "clearSession resets all three" passes but a subsequent `setSession` followed by manual `isAuthenticated = false` produces an inconsistent store. Refactor to `computed(() => token.value !== null)`.
- **"Sign-out leaves the user signed-in after page reload."** The local `clearSession()` ran but `hanko.user.logout()` did not (or rejected and was silently swallowed without the `// why:` comment explaining the failure-safe behavior). Verify the wrapper's `signOutCurrentSession` resolves; verify the Hanko cookie is gone after the call.
- **"`MyProfilePage.vue` `readAuthToken()` still reads from localStorage."** The cutover was incomplete. Repo-wide grep for `localStorage.getItem('authToken')` returns 1+ matches. Replace with `useAuthStore().token`.
- **"App.vue redirect loop on guarded route."** The route-guard mutation triggers an additional setup pass (a reactive watch was installed instead of a one-shot mutation). The setup must run exactly once; the URL change happens only on the LoginPage's navigation after `onSessionCreated`.
- **"LoginPage navigation uses `history.pushState`."** A full reload is required so the target route's bootstrap re-runs the cookie check. `history.pushState` keeps the same Vue app instance; the cached `route` value does not refresh.
- **"Test file imports `@teamhanko/hanko-elements`."** Test isolation broken — the package's web-component registration assumes browser APIs not present in jsdom. Replace with the `__hankoFactory` seam.
- **"D-16001..D-16011 entries say 'Rationale: see WP body'."** Each DECISIONS entry MUST stand alone: Decision (1 paragraph), Rationale (3+ bullets), Alternatives Rejected (2+ alternatives, each with the reason for rejection). Cross-referencing the WP body is acceptable; substituting for the rationale is not.
- **"§21 catalog row added for `requireAdminSession` or any other server function."** Scope creep. WP-160 is client-only — no `apps/server/src/**` touch, no catalog update. If a catalog change is needed, STOP and re-open the WP scope.
- **"The roadmap mindmap progress count is bumped during drafting."** Drafting only marks WP-160 as `📝 Drafted`. The `+1 done` bump happens at execution close, not at draft close. Revert the count to its pre-WP value if the drafting commit accidentally bumped it.
- **"main.ts diff is non-trivial without a rationale."** The WP body declares main.ts as "modified (likely byte-identical)". If the execution session does change main.ts, the diff must be documented in the STATUS update with a one-sentence rationale (e.g., "added bootstrap `useAuthStore()` call to instantiate the store before App.vue mounts").
