# WP-160 — Hanko Client UI (Production Sign-In Surface for arena-client)

**Status:** Draft (drafted 2026-05-17; lint-gate self-review completed; pre-flight + copilot verdicts on record)
**Primary Layer:** App / Client (`apps/arena-client/**`)
**Adjacent Layers consulted (READ-ONLY):** Server `apps/server/src/auth/**` (the WP-112/WP-126/WP-131 verifier this client produces tokens for)
**Dependencies (all `✅` on `origin/main` at `295eec6`):**
- WP-099 (Hanko broker selection; D-9901..D-9905; module-path lock at `apps/server/src/auth/hanko/`)
- WP-112 (broker-agnostic orchestrator; D-11202 bearer-header lock; D-11204 fail-closed default)
- WP-126 (Hanko verifier — the server-side that validates tokens this WP produces; D-12601..D-12604)
- WP-131 (production wiring; `productionAccountResolver` provisions `legendary.players` rows on first authenticated call; D-13101..D-13104)
- WP-052 (`AccountId` brand; `Result<T>` shape; `AuthProvider` enum `'email' | 'google' | 'discord'` — the broker name `'hanko'` MUST NOT appear)
- WP-104 (`/api/me/profile` + `OwnerProfileView` shape — the bootstrap call site after sign-in)
- WP-090 (live-match client wiring — the boardgame.io `credentials` field on the `?match=…&player=…&credentials=…` query string is unchanged; live-match transport is a separate concern from Hanko HTTP-API tokens)

**Explicit Non-Dependencies:** WP-110 (admin-billing `X-Admin-Secret` surface — left intact; cutover to `requireAdminSession` is a separate WP per WP-159 §Out of Scope). WP-159 (admin session gate — exists on the server; this WP does NOT ship any admin-only client surface today; the first admin-only client cutover happens in a later WP that pairs with WP-107). WP-107 (profile integrity — its admin client surface is its own concern, post this WP).

**Unblocks:**
- WP-101 (handle claim flow — already shipped server-side; the client surface to invoke it depends on having a signed-in user)
- WP-104 (owner profile + `/me` edit — already shipped end-to-end except that the page reads `localStorage.getItem('authToken')` placeholder; this WP replaces that with a Pinia store backed by Hanko)
- WP-106 (avatar upload — same shape)
- WP-108 (billing UI — same shape)
- WP-132 (entitlements read — same shape)
- WP-133 (Stripe checkout — same shape)
- The cutover from `admin-secret` to `admin-session-required` on WP-110's route (separate follow-up swap WP) becomes feasible once this WP lands tokens.

---

## Goal

After this session, the arena-client SPA hosts a **production sign-in flow** that produces Hanko-issued bearer tokens, exposes them through a Pinia store, and attaches them to outbound HTTP calls under `/api/me/*`. The sign-in surface lives at the new route `?route=login`. The existing `MyProfilePage.vue` (and every API client it composes — `ownerProfileApi.ts`, `billingApi.ts`) reads the token from the new Pinia store instead of the `window.localStorage.getItem('authToken')` placeholder it uses today. Sign-out clears both the Hanko session (via `hanko.user.logout()`) and the Pinia store, and navigates back to the lobby.

The result is the **first end-to-end authenticated path on production**: a player can land on the SPA, click "Sign In", complete the Hanko-hosted flow (passkey / email-OTP / federated IdP), and immediately see `/api/me/profile` return their owner-profile view with the WP-131 `productionAccountResolver` having provisioned their `legendary.players` row on the first call. Every shipped-but-functionally-blocked authenticated WP (WP-104, WP-106, WP-108, WP-132, WP-133, and via WP-159 the future admin cutover) becomes exercisable end-to-end on merge.

---

## Justification

### Operational necessity

WP-099 → WP-112 → WP-126 → WP-131 shipped the full server-side auth stack over 2026-04-27 .. 2026-05-04. Every subsequent authenticated WP (WP-104, WP-106, WP-108, WP-132, WP-133, WP-159) has shipped its server surface but cannot be exercised end-to-end because there is no deployed client UI that produces a Hanko bearer token. Direct evidence captured during the WP-159 close (2026-05-17):

- The Hanko tenant at `https://cfd0ef6d-6cb9-43a6-83c1-9956bb93bd2e.hanko.io` shows 0 total users.
- `SELECT COUNT(*) FROM legendary.players` returns 0 rows in production (no `productionAccountResolver` has fired because no authenticated request has ever reached the server).
- `apps/arena-client/package.json` lists zero `@teamhanko/*` dependencies.
- `render.yaml` deploys `legendary-arena-server` and `legendary-arena-wiki`; the arena-client SPA is deployed to Cloudflare Pages (per `apps/arena-client/.env.example`) but has no auth UI.
- The only `LoginPage.vue` in the repo is `apps/dashboard/src/pages/auth/LoginPage.vue`, which is a mock under WP-157's role-guard scaffold and **unrelated** to gameplay sign-in.
- Existing `ownerProfileApi.ts`, `billingApi.ts`, and `MyProfilePage.vue` all already accept / attach `Authorization: Bearer ${authToken}` headers but read the token via the placeholder `window.localStorage.getItem('authToken')`. The wiring is in place; only the token producer is missing.

This WP closes that gap.

### Why a single WP (not a contract-WP / implementation-WP pair)

The contract surface this WP introduces is intentionally small:
- One Pinia store with three reactive properties (`token | null`, `accountId | null`, `isAuthenticated: boolean`)
- One thin Hanko-SDK wrapper module exposing `initialize()` / `getToken()` / `logout()` / a register-event hook
- One new Vue page (`LoginPage.vue`) that mounts `<hanko-auth>`
- One new query-route discriminator (`?route=login`) on `App.vue`'s existing closed-set route enumeration
- One callsite swap inside `MyProfilePage.vue` (the only file in the repo today that reads the placeholder `authToken` from `localStorage`)

The total file count (10 source + 4 governance — see §Files Expected to Change) is at the upper bound of the §00.1 single-session cap (~8 files) but defensible per the WP-157 precedent (Dashboard Scaffold landed 25+ files in one WP because the contract surface — widget shape, route guards, polling composable — was tightly coupled and splitting would have created a useless intermediate state). The same shape applies here: a Pinia auth store without a sign-in page is useless; a sign-in page without a store to populate is useless; the consumer swap in `MyProfilePage.vue` without the store is a regression. Splitting introduces an artificial drift window with no diagnostic benefit.

### Why the web component (`@teamhanko/hanko-elements`) and not the frontend SDK

The web component approach (`<hanko-auth>` custom element backed by `@teamhanko/hanko-elements`) is the path of least resistance:

- **Hanko owns the UI surface.** Replacing Hanko with another broker later means swapping one custom-element tag; we never own the password/passkey/OTP visual flows.
- **Framework-agnostic.** Custom elements work in Vue, React, Svelte, and plain HTML. We don't maintain a Vue-specific wrapper that ages every time `@vue/runtime-dom` ships a breaking change.
- **Smaller code surface.** The frontend-SDK-only path (`@teamhanko/hanko-frontend-sdk`) requires us to own every error state, every visual transition, every accessibility concern. The web component packages all of that.
- **Matches the official starter.** [`teamhanko/hanko-vue-express-starter`](https://github.com/teamhanko/hanko-vue-express-starter)'s `vue-frontend/package.json` lists `@teamhanko/hanko-elements ^2.1.0` as the sole `@teamhanko/*` runtime dep — this is the supported pattern.

D-16001 records the choice; the WP §Locked Values pins the version range. D-16001 Alternatives Rejected enumerates the frontend-SDK-only path and the custom-UI-with-third-broker-SDK path (the latter forbidden by D-9901 anyway).

---

## Session Context

The existing authenticated HTTP surface lives at:
- `GET /api/me/profile`, `PATCH /api/me/profile`, `PUT /api/me/links` (WP-104, owner profile)
- `POST /api/me/avatar` (WP-106, avatar upload)
- `GET /api/me/billing/history`, `GET /api/me/entitlements` (WP-108, WP-132)
- `POST /api/me/billing/checkout/sessions` (WP-133, Stripe checkout)

All of these require `Authorization: Bearer <hanko-jwt>`. The WP-126 verifier validates the JWT signature against the tenant's JWKS, extracts the `sub` claim, classifies the `amr` array into an `AuthProvider` value (`'email' | 'google' | 'discord'`), and the WP-131 `productionAccountResolver` then upserts the `legendary.players` row on first hit. The `'hanko'` string is invisible at rest per D-9902.

Client-side, the existing API clients already accept `authToken: string | null` and attach the header conditionally:

```ts
// apps/arena-client/src/lib/api/ownerProfileApi.ts:114-116 (verbatim)
headers:
  authToken === null ? {} : { Authorization: `Bearer ${authToken}` },
```

The consumers (`MyProfilePage.vue`, `BillingSection.vue`) read the token at call time. The only call site that materializes a token today is the placeholder `window.localStorage.getItem('authToken')` inside `MyProfilePage.vue` lines 121-132 — annotated with a `// why:` comment that explicitly defers to "the auth-store integration paired with WP-126's broker integration". WP-160 is that integration.

`apps/arena-client/main.ts` already bootstraps Pinia (`createPinia()` at line 9). The closed-set route discriminator in `App.vue:49` is `'fixture' | 'live' | 'lobby' | 'profile' | 'me' | 'admin-billing'`; the parser at lines 83-108 extends naturally for `'login'`.

**Scope deliberately excluded from this packet** (each may motivate a future WP):
- The cutover of WP-110's `/api/admin/billing/history` route from `X-Admin-Secret` header (WP-110's `localStorage.getItem('adminSecret')` shape) to `admin-session-required` (per WP-159's gate). Separate follow-up swap WP — touching it here would conflate two unrelated authorization migrations.
- Any new admin-only client surface (e.g., the WP-107 profile-integrity admin UI). WP-107 ships its own client surface in its own WP.
- A "Sign in" link on the marketing site at `C:\www\legendary-arena-com`. Separate cross-repo concern; the SPA is the sole sign-in surface today and a follow-up marketing WP can add a link later.
- Customization of the Hanko-hosted flow (passkey opt-out, federation provider selection beyond defaults, OTP-vs-passkey priority). The widget's defaults match the WP-099 broker selection; visual customization is a later UX WP if needed.
- Silent token refresh on expiry. Hanko's `sessionCheckInterval` (default 30s, D-16005) detects expiry and fires `onSessionExpired`; the client clears the store and surfaces the 401 to the user on the next call. Background token refresh via a documented Hanko refresh API is a future hardening WP if/when the broker exposes one.
- A `<hanko-profile>` integration. `MyProfilePage.vue` already owns the owner-edit surface (WP-104). Mounting `<hanko-profile>` would duplicate the surface; a future WP can choose to swap.
- Sign-up versus sign-in differentiation. The Hanko widget handles both in one flow; explicit sign-up UX is a later concern if a separate funnel is needed.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11 (Player Identity), §14 (Explicit Decisions, No Silent Drift).

**Conflict assertion:** No conflict.

- **§3 Player Trust & Fairness.** The client never sees the verifier's private key, never re-implements signature checks, and never decides whether a token is valid — every authorization decision still happens on the server via the WP-126 verifier. The client's sole role is to obtain a token from Hanko and attach it to outbound HTTP calls. No new attack surface relative to the existing WP-112 / WP-126 / WP-131 stack. Sign-out invokes both the broker logout (clearing the broker's cookie) and the local Pinia store (clearing the in-process token), so a half-cleared state is structurally impossible.
- **§11 Player Identity.** The WP-052 `AuthProvider` enum (`'email' | 'google' | 'discord'`) is unchanged. The broker name `'hanko'` does NOT appear in the client bundle as an `auth_provider` value, fixture, seed, or quoted string — it appears only as (a) the npm package name `@teamhanko/hanko-elements`, (b) the env var name `VITE_HANKO_TENANT_BASE_URL`, and (c) JSDoc that paraphrases the broker per the §18 prose-vs-grep discipline. F-1 (the WP-099 grep gate that bans `'hanko'` as a quoted enum value) is preserved at the client boundary.
- **§14 Explicit Decisions, No Silent Drift.** Eleven decisions (D-16001..D-16011) lock the widget choice, the token storage model, the attachment mechanism, the sign-out semantics, the expiry handling, the auto-provisioning trigger, the route-guard scope, the sign-in surface placement, the failure-mode disclosure, the build-time config, and the cross-repo boundary. Each decision records the choice, the rationale, and at least one rejected alternative.

**Non-Goal proximity check:** Confirmed clear. NG-1 through NG-7 are N/A — this WP introduces no gameplay surface, no monetization surface, no entitlement mutation, no persuasive UX patterns, and no competitive surface.

**Determinism preservation:** N/A. WP-160 touches no engine, registry, scoring, replay, RNG, or simulation surface. The Hanko bearer token is server-validated at every request; replay/scoring artifacts never see it.

---

## Funding Surface Gate (§20)

**§20 N/A.** WP-160 ships an authentication UI on the gameplay SPA. None of the §20.1 trigger surfaces are touched: no global navigation funding affordance, no registry-viewer funding affordance, no profile/account funding attribution surface, no tournament funding integration, no user-visible donate/support copy. The sign-in flow's copy is owned entirely by the `@teamhanko/hanko-elements` web component; the only project-owned copy on the new LoginPage is a one-line page header ("Sign in to Legendary Arena") and a transport-failure fallback banner ("Sign-in is temporarily unavailable. Please try again later.") — neither references funding, donation, supporter tiers, or any monetization concept.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

**§21 N/A.** WP-160 is client-only. No file under `apps/server/src/**` is added, modified, or removed. No HTTP endpoint is added, modified, removed, or status-changed. No `Library-only` library function reachable via direct import from `apps/server/src/**` is touched. The Auth taxonomy in `docs/ai/REFERENCE/api-endpoints.md` is unchanged — WP-159's `admin-session-required` value already exists and no new value is introduced; no existing `authenticated-session-required` row in the catalog gains or loses an annotation because the catalog records what each endpoint requires (a static property of the endpoint), not which clients can satisfy that requirement.

---

## Assumes

- WP-099 / WP-101 / WP-104 / WP-106 / WP-108 / WP-112 / WP-126 / WP-131 / WP-132 / WP-133 complete (all `[x]` in WORK_INDEX.md).
- `legendary.players` exists with the columns enumerated in WP-159 §Session Context (per migrations 004 + 008 + 009 + 013 + 014).
- `apps/server/src/auth/sessionToken.logic.ts` exports `requireAuthenticatedSession(request, options): Promise<Result<AccountId>>` and the server is wired with `configureSessionValidation({ verifier: createHankoSessionVerifier(config), accountResolver: productionAccountResolver, database })` at startup per WP-131. Production Render env has `HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE`, and (optionally) `HANKO_JWKS_REFRESH_INTERVAL_MS` set.
- The arena-client deploys to Cloudflare Pages and the Pages project's build-time env supports `VITE_*` variables (per `apps/arena-client/.env.example` precedent and `apps/arena-client/src/lobby/lobbyApi.ts:14-21`).
- `apps/arena-client/src/main.ts` bootstraps Pinia via `createPinia()` (verified at `main.ts:9`).
- `apps/arena-client/src/App.vue` parses `?route=` against a closed-set enumeration (verified at `App.vue:49`) and the parser at `App.vue:83-108` can be extended for one additional discriminator value without changing the discrimination precedence for existing routes.
- `apps/arena-client/src/pages/MyProfilePage.vue` is the only file in the repo today that reads the placeholder `authToken` from `localStorage` (verified at `MyProfilePage.vue:121-132`).
- `pnpm install && pnpm -r build` exits 0 on `origin/main @ 295eec6`.
- The Hanko tenant identified by `VITE_HANKO_TENANT_BASE_URL` is reachable from the player's browser at the time of sign-in (operational dependency, not a code dependency).
- `@teamhanko/hanko-elements @ ^2.4.0` is published on npm and the published bundle works against the Hanko Cloud tenant API version that `apps/server/src/auth/hanko/` already speaks to (per WP-126's `HANKO_TENANT_BASE_URL` and `HANKO_EXPECTED_AUDIENCE` env contract).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — App layer responsibilities; the `apps/arena-client` row in the Import Rules table (Runtime-Safe Engine Surface only via `@legendary-arena/game-engine` `.` subpath; preplan runtime allowed; no server / no registry runtime)
- `docs/ai/REFERENCE/00.2-data-requirements.md` §1 (players entity field names — `auth_provider`, `auth_provider_id`, `ext_id`) and §Authentication (auth_provider semantics)
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` §7 (Hanko dependency exception), §10 (env var hygiene — `VITE_*` prefix), §11 (Authentication Clarity), §16 (code style), §17 (Vision Alignment), §18 (prose-vs-grep — the literal `'hanko'` string discipline)
- `docs/ai/DECISIONS.md` — scan D-5201 (AccountId / Result), D-9901..D-9905 (broker selection; broker invisible at rest; F-1..F-7 gates), D-11201..D-11204 (orchestrator; bearer header lock; fail-closed default), D-12601..D-12604 (Hanko verifier internals), D-13101..D-13104 (production wiring; fail-closed startup; `productionAccountResolver`)
- `docs/ai/work-packets/WP-099-auth-provider-selection.md` §B (Hanko Wiring Module — the contract that defines what code may live where)
- `docs/ai/work-packets/WP-112-session-token-validation-middleware.md` §A (the bearer-header contract this WP's client satisfies)
- `docs/ai/work-packets/WP-126-external-authentication-integration-hanko-session-verifier.md` (the server-side this WP's client produces tokens for)
- `docs/ai/work-packets/WP-131-authenticated-routes-production-wiring.md` (the production wiring that this WP's client interacts with on every authenticated request)
- `docs/ai/work-packets/WP-104-owner-profile-data-model-me-edit.md` §G (the API surface `MyProfilePage.vue` exercises today)
- `apps/arena-client/src/App.vue` (existing route discriminator at line 49; query parser at lines 83-108; route precedence at lines 110-140)
- `apps/arena-client/src/main.ts` (Pinia bootstrap at line 9)
- `apps/arena-client/src/lib/api/ownerProfileApi.ts` (existing `authToken: string | null` parameter pattern at lines 107, 132, 162)
- `apps/arena-client/src/lib/api/billingApi.ts` (same pattern for billing endpoints)
- `apps/arena-client/src/pages/MyProfilePage.vue` lines 121-132 (the `readAuthToken()` placeholder this WP replaces)
- `apps/arena-client/.env.example` (the `VITE_SERVER_URL` precedent for build-time client env vars)
- `apps/arena-client/vite.config.ts` (the `failOnNodeExternalization` boundary — `@teamhanko/hanko-elements` MUST be browser-only; D-14401 enforcement still applies)
- `render.yaml` (lines 49-64 — how `HANKO_TENANT_BASE_URL` is supplied server-side; the client's `VITE_HANKO_TENANT_BASE_URL` is a separate Cloudflare-Pages-injected value, not a server-injected one)
- Hanko documentation (read-only, framing the design decisions): [`@teamhanko/hanko-elements` README](https://github.com/teamhanko/hanko/blob/main/frontend/elements/README.md), [Hanko Elements guide](https://docs.hanko.io/guides/hanko-elements/introduction), [`hanko-vue-express-starter`](https://github.com/teamhanko/hanko-vue-express-starter)

---

## Non-Negotiable Constraints

### Engine-wide
- Full file contents for every new or modified file (no diffs, no snippets)
- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- No `axios` or `node-fetch` — built-in `fetch` only (used inside the API clients already; this WP introduces no new HTTP client)
- All commands use `pnpm` — never `npm run`

### Packet-specific — broker invisibility (F-1 / F-2)
- The literal string `'hanko'` (single-quoted, double-quoted, backtick-quoted, or unquoted) MUST NOT appear in any new client source file as an `auth_provider` value, store-key value, fixture value, or stored-string value. It may appear ONLY in: (a) the npm package name `@teamhanko/hanko-elements` in import statements + `package.json`, (b) the env var name `VITE_HANKO_TENANT_BASE_URL`, (c) the env var name `VITE_HANKO_API_URL` if introduced (see §Locked Values; default plan uses BASE_URL only), (d) JSDoc / `// why:` prose that paraphrases the broker per §18 (e.g., "the authentication broker", "the configured identity provider"), and (e) the Hanko tenant URL emitted into the bundle by Vite's build-time replacement.
- Every `@teamhanko/*` import MUST be confined to the new files `apps/arena-client/src/auth/hankoClient.ts` (the SDK wrapper) and `apps/arena-client/src/auth/hankoClient.test.ts` (the test that stubs the wrapper). No other file in the repo may import `@teamhanko/*`. The Pinia auth store at `apps/arena-client/src/stores/auth.ts` MUST NOT import `@teamhanko/*`; it stores only `string` and `null`. The `LoginPage.vue` MUST NOT import `@teamhanko/*` directly; it consumes the wrapper's `initialize()` and registers the `<hanko-auth>` custom element by tag name only.
- This mirrors the WP-099 / WP-126 D-9904 server-side discipline (`apps/server/src/auth/hanko/` is the only directory allowed to import `@teamhanko/*` on the server) and extends it to the client. A future broker swap = (a) swap the `apps/arena-client/src/auth/hankoClient.ts` implementation, (b) swap the custom element tag in `LoginPage.vue`'s template, (c) swap the npm dep. The Pinia store, every API client, and `MyProfilePage.vue` are byte-identical pre / post a future broker swap.

### Packet-specific — auth store contract
- `apps/arena-client/src/stores/auth.ts` exports `useAuthStore` returning a Pinia store with exactly three reactive state fields (`token: string | null`, `accountId: string | null`, `isAuthenticated: boolean`) and exactly four action methods (`setSession(token: string, accountId: string | null): void`, `clearSession(): void`, `bootstrapFromCachedToken(token: string | null): void`, an internal `markAuthenticated(): void` is acceptable). No other state field. No `expiresAt`, no `userEmail`, no `roles`, no `permissions`, no Hanko-specific shape. The store is a typed transport for "is there a bearer token, and if so what is it".
- `isAuthenticated` MUST be a derived field: `computed(() => token.value !== null)`. It MUST NOT be a separately-settable boolean. (Drift hazard: two sources of truth — `token` and `isAuthenticated` — would let one diverge from the other.)
- `accountId` is **optional and lags**. The store accepts an `accountId` argument in `setSession()`, but the WP-160 sign-in flow sets `accountId: null` at sign-in time (the broker token authenticates the player but does not directly surface the server-side `legendary.players.ext_id`). The first authenticated call to `/api/me/profile` is what triggers WP-131's `productionAccountResolver` to provision the row and surface the `ext_id`; a future WP can extend the store's bootstrap call chain to populate `accountId` after that response if a consumer needs it. Today, no consumer reads `accountId` — keeping the field present-but-null on day one avoids a follow-up store-shape change when the first consumer arrives.
- The store MUST NOT persist its own state. Reload reads from the cookie (via `hanko.getSessionToken()`); the store's lifetime is bounded by the Vue app instance.

### Packet-specific — Hanko SDK wrapper contract
- `apps/arena-client/src/auth/hankoClient.ts` exports exactly four named functions: `initializeHankoClient(options: HankoClientInitOptions): Promise<HankoClientHandle>`, `getCurrentTokenFromHandle(handle: HankoClientHandle): string | null`, `signOutCurrentSession(handle: HankoClientHandle): Promise<void>`, and `subscribeToSessionEvents(handle: HankoClientHandle, listeners: HankoSessionListeners): void`. It exports exactly two named types: `HankoClientHandle` (opaque to consumers — the underlying `Hanko` instance is wrapped) and `HankoSessionListeners` (the closed-set callback object `{ onSessionCreated, onSessionExpired, onUserLoggedOut }`).
- The wrapper MUST accept an optional `__hankoFactory` testing seam in `HankoClientInitOptions` per the caller-injected-provider pattern (D-12603 + D-11201 precedent on the server side). Production callers omit it; tests inject a fake factory. Module-level `import` of `@teamhanko/hanko-elements` is permitted (Vite tree-shakes browser-only code), but the actual `register()` call MUST go through the (production-default | injected) factory.
- The wrapper MUST NOT directly write to `localStorage`, `sessionStorage`, or `document.cookie`. Token storage is delegated entirely to the Hanko SDK's configured `storageKey` (default `'cookie'` per D-16002). The wrapper's `getCurrentTokenFromHandle()` reads via `hanko.getSessionToken()` only.
- The wrapper MUST fail-closed on `register()` failure: the returned promise rejects with a typed error (`HankoInitializationFailed`), no half-initialized handle is returned, no console errors leak the tenant URL or any payload.
- `subscribeToSessionEvents` MUST register the three callbacks via `hanko.onSessionCreated(listener)`, `hanko.onSessionExpired(listener)`, and `hanko.onUserLoggedOut(listener)`. Any other Hanko event hook (`onUserDeleted`, `onSessionResumed`, etc.) is OUT OF SCOPE for this WP — if a future consumer needs them, extend the listeners object via a closed-set drift test like WP-159's `ADMIN_SESSION_ERROR_CODES`.

### Packet-specific — LoginPage contract
- `LoginPage.vue` mounts exactly one `<hanko-auth>` custom element. No `<hanko-profile>`, no `<hanko-events>`.
- The page reads `?returnTo=<route-value>` from the URL at mount time. On `onSessionCreated` (received via the wrapper's listener), it navigates to `?route=<returnTo>` if `returnTo` is one of the closed-set route values `'me' | 'admin-billing'` (the only guarded routes today), otherwise falls back to `?route=` (lobby).
- The page renders one of exactly four visual states: `initializing` (page loaded, wrapper `initialize()` in flight — render a static "Preparing sign-in…" placeholder), `ready` (wrapper succeeded; render the `<hanko-auth>` element), `unavailable` (wrapper `initialize()` rejected — render a static "Sign-in is temporarily unavailable. Please try again later." banner), `signing-out` (sign-out in progress; render nothing). Closed set; no other states; no error-detail leakage (the banner copy is static).
- The page MUST NOT log the token, the player's email, or any Hanko payload to the console. The only permitted console output is a `[auth]` prefix tag on (a) `console.warn` for `unavailable` (no body — just the category) and (b) `console.debug` for state transitions in dev mode (gated on `import.meta.env.DEV`).
- Sign-out is invoked from a button on `MyProfilePage.vue` (added in this WP) — NOT from `LoginPage.vue`. The LoginPage's role is sign-in only; the sign-out affordance lives on the page the user is signed-in on.

### Packet-specific — sign-in / sign-out flow
- Sign-in flow: user navigates to `?route=login&returnTo=<route>` → `LoginPage.vue` mounts → wrapper `initialize()` resolves → `<hanko-auth>` renders → user completes Hanko flow → `onSessionCreated` fires → page reads `hanko.getSessionToken()` via wrapper → calls `useAuthStore().setSession(token, null)` → navigates to `?route=<returnTo>`.
- Sign-out flow: user clicks sign-out on `MyProfilePage.vue` → page calls `signOutCurrentSession(handle)` (which calls `hanko.user.logout()`) → on success, calls `useAuthStore().clearSession()` → navigates to `?route=` (lobby).
- App-bootstrap flow: at `App.vue` setup time, if the current route is guarded (`me` or `admin-billing`), the app calls `initializeHankoClient()` → reads `hanko.getSessionToken()` → if non-null, calls `useAuthStore().bootstrapFromCachedToken(token)` and renders the requested page; if null, navigates to `?route=login&returnTo=<currentRoute>`. Unguarded routes do NOT trigger `initializeHankoClient()` at bootstrap (the Hanko SDK is lazy-loaded — only paid on a guarded-route load or an explicit sign-in attempt).
- Expiry-during-session: the wrapper's `subscribeToSessionEvents` `onSessionExpired` callback (registered at app bootstrap on guarded routes) calls `useAuthStore().clearSession()`. The page in flight will receive a 401 on its next API call and surface its existing error banner; the next user navigation to a guarded route will route to `?route=login&returnTo=...` via the bootstrap check above.
- No automatic redirect on expiry — the user finishes whatever interaction they were in, sees the existing 401 banner, and re-signs in on their next guarded-route navigation. This avoids surprise-navigations in the middle of a form-fill.

### Packet-specific — MyProfilePage.vue cutover
- The `readAuthToken()` function at lines 121-132 of `MyProfilePage.vue` is REPLACED with a Pinia store read via `useAuthStore().token`. The replacement preserves the function's `string | null` return type. The annotated `// why:` comment that defers to "WP-126's broker integration" is REPLACED with a `// why:` comment citing WP-160 / D-16003 (the token-attachment decision) and explaining that the store is populated by the Hanko SDK wrapper.
- A new "Sign out" button is added to the page header. Clicking it calls `signOutCurrentSession(handle)` (handle obtained via a `useAuthStore` + a module-scoped lazy initializer) → on success → navigates to `?route=` (lobby).
- The existing 401 / `session_verifier_not_configured` banner copy is UNCHANGED — the page already handles these codes via `bannerCopyForCode()`. If a user's session expires mid-page-use, the existing banner still fires; this WP adds the sign-in path back, it does not change the failure surface.
- The page MUST NOT eagerly initialize the Hanko client on mount — the initialization happens at App.vue bootstrap for guarded routes (`me` is guarded) so the SDK is already loaded by the time the page mounts.

### Packet-specific — App.vue route discriminator
- The closed-set `AppRoute` type at `App.vue:49` is EXTENDED with the value `'login'`. The closed-set assertion test (not currently present in the repo — see Out of Scope) is NOT a deliverable of this WP; the discriminator extension is small enough that a one-character grep at lint time suffices to verify completeness.
- The query parser at `App.vue:83-108` is EXTENDED with `routeParam === 'login'` discrimination plus a `readQueryParam(params, 'returnTo')` parse. The discrimination precedence at `App.vue:110-140` is UNCHANGED for existing routes; `'login'` slots in at the highest precedence below `admin-billing` and `me` (specifically: `admin-billing > me > login > profile > fixture > live > lobby`). Rationale: a stale `?route=` left over from an earlier session must not shadow an explicit `?route=login` navigation.
- The route guard for `me` and `admin-billing` is implemented in the App.vue setup: if the current route is one of these values AND the bootstrap reveals no cached token (`hanko.getSessionToken()` returns null), App.vue MUTATES the local `route` value to `'login'` and sets the `returnTo` parameter to the originally-requested route. This is a one-shot mutation at setup time, NOT a reactive watch; the user's URL bar still reads `?route=me` but the rendered page is `LoginPage`. On successful sign-in the page navigates to `?route=me` (a real URL change) and the bootstrap re-runs.

### Packet-specific — package / config discipline
- `apps/arena-client/package.json` adds `@teamhanko/hanko-elements` at version `^2.4.0` under `dependencies` (NOT `devDependencies` — it ships in the production bundle). The version range `^2.4.0` is the major-2 minor-pinned-at-4 range, matching the WP-126 server-side SDK-version-pin discipline.
- `apps/arena-client/.env.example` adds `VITE_HANKO_TENANT_BASE_URL=https://<tenant-id>.hanko.io` as the documented client env var. The value MUST mirror the server's `HANKO_TENANT_BASE_URL` (the same Hanko tenant). No new env var beyond this one is introduced; `HANKO_EXPECTED_AUDIENCE` is server-side validation-only and the client does not need it.
- The `failOnNodeExternalization` Vite guard at `apps/arena-client/vite.config.ts:22` MUST remain green after the dep addition. `@teamhanko/hanko-elements` is browser-only; if a transitive dep tries to pull a `node:*` import into the bundle, the build hard-fails per D-14401 and we triage before merge.
- The arena-client tsconfig `paths` MUST NOT route `@teamhanko/*` to anything; the dep resolves via standard pnpm hoisting.

### Packet-specific — test discipline
- `hankoClient.test.ts` uses the `__hankoFactory` testing seam to inject a fake `Hanko` factory; it does NOT load `@teamhanko/hanko-elements` at test time (the package's web-component registration assumes browser APIs not present in jsdom). The test verifies: (a) successful `initialize()` returns a handle, (b) `register()` failure → `HankoInitializationFailed` rejection, (c) the three event hooks are registered exactly once each, (d) `getCurrentTokenFromHandle()` returns whatever `hanko.getSessionToken()` returns, (e) `signOutCurrentSession()` invokes `hanko.user.logout()` exactly once.
- `auth.test.ts` is pure Pinia — no Hanko surface. It verifies: (a) initial state (`token === null`, `accountId === null`, `isAuthenticated === false`), (b) `setSession('jwt', 'acc-123')` updates all three (with `isAuthenticated === true` derived from `token`), (c) `clearSession()` resets all three, (d) `bootstrapFromCachedToken('jwt')` sets `token` and `isAuthenticated` but leaves `accountId === null`, (e) `bootstrapFromCachedToken(null)` is a no-op (does not clobber a previously-set session).
- Both test files use `node:test` + `node:assert` per project convention (`apps/arena-client/package.json` line 12 — `node --import tsx --import @legendary-arena/vue-sfc-loader/register --test src/**/*.test.ts`).
- Neither test file imports `boardgame.io`, makes network calls, requires a database, or touches the actual `@teamhanko/hanko-elements` package.

### Session protocol
- If during execution Claude finds that the existing `MyProfilePage.vue` shape (line numbers, function signatures, prop names) has drifted from this WP's description, STOP and surface the drift before patching. The line numbers in this WP are pinned to `origin/main @ 295eec6`.
- If `@teamhanko/hanko-elements @ ^2.4.0` is unpublished or pulled between WP draft and execution, STOP and report. Do NOT silently substitute a different version range or a different package.
- If the Hanko SDK's documented API has shifted (e.g., `getSessionToken` renamed, `onSessionCreated` removed) between draft and execution, STOP and surface the gap. Do NOT improvise — re-open the WP framing.
- If `pnpm install` produces a `node:*` externalization warning that the `failOnNodeExternalization` Vite plugin would hard-fail on, STOP and report. The plugin is the authority; the dep is the variable.

### Locked contract values

- **New runtime npm dependency:** `@teamhanko/hanko-elements` at version range `^2.4.0` (under `dependencies`)
- **New client env var:** `VITE_HANKO_TENANT_BASE_URL` (build-time, inlined by Vite per D-16010); mirrors server `HANKO_TENANT_BASE_URL`
- **New route discriminator value:** `'login'` (added to the `AppRoute` closed-set union in `App.vue:49`)
- **New URL query param:** `returnTo` (single value, one of the closed-set route values `'me' | 'admin-billing'`; any other value falls back to `?route=` lobby on sign-in success)
- **Route guard scope (closed set):** exactly `'me'` and `'admin-billing'` are guarded. `'fixture' | 'live' | 'lobby' | 'profile' | 'login'` are unguarded. Per D-16007.
- **Discrimination precedence (extended):** `admin-billing > me > login > profile > fixture > live > lobby`
- **Pinia store id:** `'auth'`
- **Pinia store state shape:**
  ```ts
  export interface AuthStoreState {
    readonly token: string | null;
    readonly accountId: string | null;
    readonly isAuthenticated: boolean;
  }
  ```
- **Pinia store actions:** `setSession(token: string, accountId: string | null): void`, `clearSession(): void`, `bootstrapFromCachedToken(token: string | null): void`
- **Hanko SDK wrapper export surface:**
  ```ts
  export interface HankoClientInitOptions {
    readonly tenantBaseUrl: string;
    readonly sessionCheckIntervalMs?: number;
    readonly __hankoFactory?: (tenantUrl: string, options: unknown) => Promise<HankoLike>;
  }
  export interface HankoClientHandle { /* opaque to consumers */ }
  export interface HankoSessionListeners {
    readonly onSessionCreated: (token: string) => void;
    readonly onSessionExpired: () => void;
    readonly onUserLoggedOut: () => void;
  }
  export class HankoInitializationFailed extends Error {}
  export function initializeHankoClient(options: HankoClientInitOptions): Promise<HankoClientHandle>;
  export function getCurrentTokenFromHandle(handle: HankoClientHandle): string | null;
  export function signOutCurrentSession(handle: HankoClientHandle): Promise<void>;
  export function subscribeToSessionEvents(handle: HankoClientHandle, listeners: HankoSessionListeners): void;
  ```
- **LoginPage visual states (closed set):** `'initializing' | 'ready' | 'unavailable' | 'signing-out'`
- **LoginPage failure-banner copy (verbatim):** `"Sign-in is temporarily unavailable. Please try again later."`
- **LoginPage preparing-banner copy (verbatim):** `"Preparing sign-in…"`
- **MyProfilePage sign-out button label (verbatim):** `"Sign out"`
- **Console log prefix for auth events:** `[auth]` (single token, no trailing colon, used in `console.warn` and `console.debug` only)
- **Sign-in success default fallback route:** `?route=` (lobby) when `returnTo` is absent or not in the guarded-route closed set
- **`sessionCheckInterval` default:** unset (defer to Hanko's default of 30000ms); the option is exposed on `HankoClientInitOptions` for future tuning without a WP edit
- **Decisions reserved:** D-16001..D-16011 (added on execution close)

---

## Scope (In)

### A) Hanko SDK Wrapper — NEW

**File:** `apps/arena-client/src/auth/hankoClient.ts` — **new**

Exports the four functions + two interfaces + one error class defined in §Locked Values. The implementation:

1. `initializeHankoClient(options)`:
   - Resolves the factory: `options.__hankoFactory ?? defaultProductionFactory`. The default factory is the production binding that wraps `register()` from `@teamhanko/hanko-elements`.
   - Calls the factory with `(options.tenantBaseUrl, { sessionCheckInterval: options.sessionCheckIntervalMs })`. The `sessionCheckInterval` key is only included if a value is provided — otherwise the SDK's default applies.
   - Wraps any thrown / rejected error in `HankoInitializationFailed` with a static message; the underlying error is intentionally swallowed (no console leak of the tenant URL or any payload).
   - Returns a `HankoClientHandle` that internally holds the `HankoLike` instance.
2. `getCurrentTokenFromHandle(handle)`: returns `handle.hanko.getSessionToken() ?? null` (explicit `?? null` normalizes any falsy return).
3. `signOutCurrentSession(handle)`: calls `handle.hanko.user.logout()`. Errors are NOT caught — sign-out failure is a typed reject that the caller (`MyProfilePage.vue`) surfaces as a banner.
4. `subscribeToSessionEvents(handle, listeners)`:
   - Calls `handle.hanko.onSessionCreated((session) => listeners.onSessionCreated(handle.hanko.getSessionToken() ?? ''))`. (We re-read the token via `getSessionToken()` rather than parsing the event payload — the Hanko event payload shape varies across versions; `getSessionToken()` is the documented stable API.)
   - Calls `handle.hanko.onSessionExpired(() => listeners.onSessionExpired())`
   - Calls `handle.hanko.onUserLoggedOut(() => listeners.onUserLoggedOut())`

Required JSDoc:
- Module header citing WP-160, D-16001 (widget choice), D-16002 (token storage), D-16003 (attachment), and the broker-invisibility discipline (`@teamhanko/*` confined to this directory).
- Each exported function has a JSDoc summary, parameter docs, return doc, and a `// why:` comment for any non-obvious control flow.

### B) Hanko SDK Wrapper Tests — NEW

**File:** `apps/arena-client/src/auth/hankoClient.test.ts` — **new**

Tests use `node:test` + `node:assert` with the `__hankoFactory` injection seam. Test cases:

1. **Happy path init.** Inject a fake factory that resolves to a stub `HankoLike` exposing `getSessionToken: () => 'jwt-abc'`. Assert `initializeHankoClient({ tenantBaseUrl: 'https://example.com', __hankoFactory: fake })` resolves to a handle, and `getCurrentTokenFromHandle(handle) === 'jwt-abc'`.
2. **Factory rejection → typed error.** Inject a fake factory that throws `new Error('network down')`. Assert the returned promise rejects with `HankoInitializationFailed` and the rejected error's message does NOT contain `'network down'` or any other internal detail.
3. **Token getter returns null when SDK returns null.** Fake `getSessionToken: () => null`. Assert `getCurrentTokenFromHandle(handle) === null`.
4. **Token getter returns null when SDK returns empty string.** Fake `getSessionToken: () => ''`. Assert `getCurrentTokenFromHandle(handle) === null` (the `?? null` normalizes falsy — verify the empty-string case explicitly so a future SDK behavior change does not silently leak an empty-string token to API clients).
5. **Sign-out invokes `hanko.user.logout()` exactly once.** Fake exposes a logout spy. Assert `await signOutCurrentSession(handle)` and the spy was called once with no args.
6. **Sign-out propagates SDK rejection.** Fake `user.logout: async () => { throw new Error('hanko down') }`. Assert `signOutCurrentSession(handle)` rejects (the caller surfaces the banner).
7. **`subscribeToSessionEvents` registers all three listeners.** Fake records each subscription. Assert each of `onSessionCreated`, `onSessionExpired`, `onUserLoggedOut` was invoked on the fake exactly once with a function argument.
8. **`onSessionCreated` callback receives the current token from `getSessionToken()`, not the event payload.** Fake records the listener registered for `onSessionCreated`, then invokes that listener with an arbitrary fake event object. Assert the consumer listener (the `HankoSessionListeners.onSessionCreated`) was invoked with the value returned from `getSessionToken()` at fire time, NOT with the fake event payload.

### C) Pinia Auth Store — NEW

**File:** `apps/arena-client/src/stores/auth.ts` — **new**

Exports `useAuthStore` per the Pinia 2.x `defineStore` pattern (Composition-API style — matches `apps/arena-client/src/stores/uiState.ts` precedent). State shape per §Locked Values. The three actions:

- `setSession(token, accountId)`: assigns to the underlying refs.
- `clearSession()`: resets both refs to `null`.
- `bootstrapFromCachedToken(cachedToken)`: if `cachedToken === null` → no-op (does not clobber an existing session); if non-null → assigns `token = cachedToken`, leaves `accountId` unchanged.

`isAuthenticated` is a `computed(() => token.value !== null)`.

Required JSDoc:
- Module header citing WP-160 and D-16003 (the attachment-via-Pinia-store decision).
- Each action has a JSDoc summary explaining its single responsibility.

### D) Pinia Auth Store Tests — NEW

**File:** `apps/arena-client/src/stores/auth.test.ts` — **new**

Tests follow the `apps/arena-client/src/stores/uiState.test.ts` precedent (`createPinia()` + `setActivePinia()` per test). Test cases:

1. **Initial state.** Fresh store → `token === null`, `accountId === null`, `isAuthenticated === false`.
2. **`setSession` populates all three.** `setSession('jwt-abc', 'acc-123')` → `token === 'jwt-abc'`, `accountId === 'acc-123'`, `isAuthenticated === true`.
3. **`setSession` with `accountId === null` works.** `setSession('jwt-abc', null)` → `token === 'jwt-abc'`, `accountId === null`, `isAuthenticated === true`. (The day-one flow uses this shape — see §Packet-specific — auth store contract above.)
4. **`clearSession` resets to initial.** After `setSession('jwt-abc', 'acc-123')`, calling `clearSession()` → all three back to initial values.
5. **`bootstrapFromCachedToken('jwt-abc')` on fresh store** → `token === 'jwt-abc'`, `accountId === null`, `isAuthenticated === true`.
6. **`bootstrapFromCachedToken(null)` on fresh store is a no-op.** State remains `{ null, null, false }`.
7. **`bootstrapFromCachedToken(null)` on populated store does NOT clobber.** After `setSession('jwt-existing', 'acc-existing')`, calling `bootstrapFromCachedToken(null)` leaves the state at `{ 'jwt-existing', 'acc-existing', true }`.
8. **`isAuthenticated` is derived (not separately settable).** A type-only assertion (in a comment) that the store exposes `isAuthenticated` as `ComputedRef<boolean>` not `Ref<boolean>`. (No runtime test needed — TypeScript catches the violation at compile time.)

### E) LoginPage — NEW

**File:** `apps/arena-client/src/pages/LoginPage.vue` — **new**

Vue component using `defineComponent({ setup() { return {...} } })` (per the App.vue precedent — `<script setup>` is forbidden by the vue-sfc-loader separate-compile pipeline per D-6512 / P6-30). The component:

1. On `setup()`: parses `?returnTo` from `window.location.search` (single read at setup time; no reactive watch). Validates against the closed-set route values; invalid → `null`.
2. On `onMounted()`: calls `initializeHankoClient({ tenantBaseUrl: import.meta.env.VITE_HANKO_TENANT_BASE_URL })`. On success: stores the handle, transitions visual state from `'initializing'` to `'ready'`, then calls `subscribeToSessionEvents(handle, { onSessionCreated: handleSignIn, onSessionExpired: noop, onUserLoggedOut: noop })`. (The page's only event of interest is sign-in success — sign-out is handled on the page the user is signed-in on, not here.) On failure: transitions to `'unavailable'` and `console.warn('[auth]', 'init')`.
3. `handleSignIn` reads `getCurrentTokenFromHandle(handle)`. If `null` → transition to `'unavailable'` (defensive — should never happen if `onSessionCreated` fires). If non-null → calls `useAuthStore().setSession(token, null)` and navigates to `?route=${returnTo ?? ''}` (empty string falls back to lobby via App.vue's existing `route === 'lobby'` default).
4. Navigation uses `window.location.assign(newUrl)` (not `history.pushState`) — a full page reload re-runs `App.vue`'s setup with the new route AND triggers a fresh `initializeHankoClient` on the target guarded route, ensuring the bootstrap-from-cached-token path exercises the just-set cookie.
5. Template renders one of the four states. The `<hanko-auth>` element is mounted conditionally on `state === 'ready'`. The tenant URL is bound via the `api` attribute: `<hanko-auth :api="tenantBaseUrl">`.

Required JSDoc:
- Module header citing WP-160 and D-16008 (sign-in surface placement decision).
- A `// why:` comment on the navigation strategy (full reload, not pushState).
- A `// why:` comment on the closed-set `returnTo` validation.

### F) App.vue Route Discriminator Extension — MODIFIED

**File:** `apps/arena-client/src/App.vue` — **modified**

Changes (the file is otherwise byte-identical to its pre-WP form):

1. `AppRoute` union at line 49 → add `'login'` (new closed-set value).
2. `ParsedQuery` interface at lines 57-63 → add `loginRoute: boolean` and `returnTo: string | null`.
3. `parseQuery` at lines 83-108 → add `loginRoute = routeParam === 'login'` and `returnTo = readQueryParam(params, 'returnTo')`.
4. `selectRoute` at lines 110-140 → add `if (parsed.loginRoute) return 'login'` BETWEEN the `me` branch and the `profile` branch (precedence: `admin-billing > me > login > profile > fixture > live > lobby` per §Locked Values).
5. **NEW route-guard logic** in `setup()`: after `route` is selected, if `route === 'me' || route === 'admin-billing'`, lazy-call `initializeHankoClient({ tenantBaseUrl })`. If `getCurrentTokenFromHandle(handle)` returns null, MUTATE the local `route` value to `'login'` and store `returnTo = <original route value>` for the LoginPage to read from the query (the URL is NOT changed at this stage — the user's URL bar still shows `?route=me` but the rendered page is `LoginPage`). If a token IS present, call `useAuthStore().bootstrapFromCachedToken(token)` and register the `subscribeToSessionEvents` callbacks: `onSessionExpired` clears the store, `onUserLoggedOut` clears the store, `onSessionCreated` is a noop (the sign-in already happened on the LoginPage; the App.vue subscription is for the expiry/logout side).
6. The `<AdminBillingPage />` and `<MyProfilePage />` slots in the template are wrapped with the unchanged `route === 'admin-billing'` / `route === 'me'` checks; a new `<template v-else-if="route === 'login'"><LoginPage :return-to="returnTo" /></template>` slot is added.
7. `defineAsyncComponent` for `LoginPage` follows the existing pattern at lines 30-47 (lazy-load, comment citing per-route bundle-size discipline).

The route-guard mutation in step 5 is a one-shot at setup time, NOT a reactive watch — the rendered route does not change after the initial render except via a page navigation (which re-runs setup).

### G) main.ts — MODIFIED (no logic change; only an import re-order may be needed)

**File:** `apps/arena-client/src/main.ts` — **modified**

The file remains byte-identical EXCEPT for one possible adjustment if the existing `useUiStateStore(pinia)` call needs to be re-ordered around a new `useAuthStore` initialization. Reviewing the current file: the dev-only fixture-harness block at lines 25-34 does not need to interact with the auth store, so the existing file structure is preserved. **The likely outcome of this entry is a no-op modification.** The file is listed in §Files Expected to Change defensively in case the execution session discovers a reason to inject auth-store bootstrap at this site (e.g., an SSR concern not visible at draft time); if no change is needed, the file is removed from the executed diff and the §Acceptance Criteria item below confirms byte-identical state.

### H) MyProfilePage.vue Cutover — MODIFIED

**File:** `apps/arena-client/src/pages/MyProfilePage.vue` — **modified**

Changes (line numbers pinned to `origin/main @ 295eec6`):

1. **Imports:** add `import { useAuthStore } from '../stores/auth';` and `import { signOutCurrentSession, initializeHankoClient, type HankoClientHandle } from '../auth/hankoClient';`.
2. **`readAuthToken()` at lines 121-132:** REPLACED with:
   ```ts
   function readAuthToken(): string | null {
     // why: WP-160 / D-16003 — the auth token is held in the Pinia auth store,
     // populated by the Hanko SDK wrapper at app bootstrap (App.vue) or sign-in
     // (LoginPage.vue). Reading from the store keeps the token's source of truth
     // in one place; previously this function read from localStorage as a
     // placeholder pending WP-126's broker integration (now landed via WP-160).
     return useAuthStore().token;
   }
   ```
3. **Sign-out button:** added to the page header (template change at the existing header markup). On click, calls `await signOut()`. Implementation:
   ```ts
   async function signOut(): Promise<void> {
     try {
       const handle = await ensureHankoHandle();
       await signOutCurrentSession(handle);
     } catch {
       // why: even if the broker logout call fails (network down, broker
       // unreachable), clear the local store and navigate to lobby. The cookie
       // may persist on the client; the next page load will re-detect it and
       // route the user back through sign-in. This is the failure-safe path:
       // a stuck sign-in state is worse than a stale-cookie state.
     }
     useAuthStore().clearSession();
     window.location.assign('?route=');
   }
   ```
4. **`ensureHankoHandle()` helper:** a module-scoped lazy initializer that calls `initializeHankoClient({ tenantBaseUrl: import.meta.env.VITE_HANKO_TENANT_BASE_URL })` exactly once and memoizes the handle. (This is the only acceptable in-app memoization per the WP-159 precedent — the Hanko SDK initialization is expensive and idempotent; rebuilding the handle per sign-out click would race with App.vue's bootstrap.)

The page's existing `bannerCopyForCode()` mapping is UNCHANGED — the 401 / `session_verifier_not_configured` paths still surface their existing banners; this WP adds the sign-in path back, it does not alter how failures are displayed.

### I) package.json — MODIFIED

**File:** `apps/arena-client/package.json` — **modified**

Add `"@teamhanko/hanko-elements": "^2.4.0"` to `dependencies`. Sort alphabetically per repo convention. No other change.

### J) .env.example — MODIFIED

**File:** `apps/arena-client/.env.example` — **modified**

Add:
```
# VITE_HANKO_TENANT_BASE_URL — Hanko tenant origin (matches server HANKO_TENANT_BASE_URL).
#
# Per-environment source:
#   - Local development: set in .env to your dev Hanko tenant URL.
#   - Cloudflare Pages: inject as a build-time environment variable in the
#     Pages project settings; Vite statically inlines it into the client bundle.
#   - Production: set in the Cloudflare Pages project settings before the build runs.
#
# The server-side counterpart HANKO_TENANT_BASE_URL is set in render.yaml and the
# Render dashboard (per WP-126 / D-12602). Both MUST point at the same Hanko tenant.
VITE_HANKO_TENANT_BASE_URL=https://your-tenant-id.hanko.io
```

### K) WORK_INDEX.md — MODIFIED

**File:** `docs/ai/work-packets/WORK_INDEX.md` — **modified**

- Add WP-160 line under Phase 7 in the Auth Stack section (post WP-159).
- Extend the dependency-chain notes under the Auth Stack block to show WP-160 as the client-side counterpart to WP-099/112/126/131.

### L) EC_INDEX.md — MODIFIED

**File:** `docs/ai/execution-checklists/EC_INDEX.md` — **modified**

- Add `EC-174` row mapping to WP-160 with Status `Draft`.

### M) Roadmap Mindmap — MODIFIED

**File:** `docs/05-ROADMAP-MINDMAP.md` — **modified**

- Add `["WP-160 📝 Drafted — Hanko client UI (production sign-in surface)"]` to the `Auth Stack & Profile Surface` cluster (cluster currently shows 9/9 ✅ — WP-160 makes it 9 ✅ + 1 📝).
- DO NOT bump the Progress Summary done count (that happens at execution close).
- Update the "Last updated" footer line.

### N) DECISIONS.md — DRAFT-TIME RESERVATIONS (Optional draft-time write; mandatory at execution close)

**File:** `docs/ai/DECISIONS.md`

Eleven entries reserved (D-16001..D-16011) per §Open Design Decisions below. Per `01.0a §Step 4 #Optional DECISIONS reservations`, the entries are drafted with the marker "Drafted 2026-05-17; not yet landed." and flip to "Active (post-execution)" in Session 2. The drafting session lands the reservations as part of the SPEC PR so the numbers are claimed against the free pool.

---

## Open Design Decisions (Locked at Draft Time → D-16001..D-16011)

Each below has a Decision (locked answer), Rationale, and Alternatives Rejected. Full DECISIONS.md entries are reserved per §N above.

**D-16001 — Widget choice: `@teamhanko/hanko-elements` web component (NOT `@teamhanko/hanko-frontend-sdk`).** See §Justification for rationale. Alternatives rejected: frontend-SDK-only (more code surface; we own every error path and visual transition); custom UI calling a different broker's SDK (Auth0/Clerk forbidden by D-9901). Version range pinned: `^2.4.0`.

**D-16002 — Token storage: Hanko's default cookie storage (`storageKey: 'cookie'`, JS-accessible).** The Hanko cookie persists across reloads and is readable via `hanko.getSessionToken()` (NOT httpOnly). Per D-11202 the server only accepts bearer-header tokens, so the client must read the cookie value and attach it as `Authorization: Bearer <token>` — making JS access mandatory. Alternatives rejected: `sessionStorage` (loses token on tab close — friction for returning players); custom in-memory only (loses token on reload); httpOnly cookie (would block JS access — incompatible with D-11202).

**D-16003 — Token attachment: Pinia auth store read at call time inside existing API clients.** The Hanko wrapper populates `useAuthStore().token`; existing API clients (`ownerProfileApi.ts`, `billingApi.ts`) keep their `authToken: string | null` parameter unchanged; consumers (`MyProfilePage.vue`, `BillingSection.vue`) read from the store. Preserves D-11202. Alternatives rejected: global `fetch` wrapper (opaque to call sites; harder to test; coupling problem); per-call-site `hanko.getSessionToken()` (couples every API client to Hanko); leaving `localStorage.getItem('authToken')` as the canonical source (the cookie is the broker's authoritative source — keeping localStorage is drift).

**D-16004 — Sign-out semantics: `hanko.user.logout()` + Pinia `clearSession()` + navigate to lobby.** Both broker-side and local-side state are cleared. Alternatives rejected: local-only clear (the Hanko cookie would persist; next reload silently re-authenticates); broker-only call (the Pinia store would still hold the stale token until next page load).

**D-16005 — Token expiry mid-session: Hanko's `sessionCheckInterval` fires `onSessionExpired` → Pinia `clearSession()`; no automatic redirect.** The user sees the existing 401 banner on their next API call and re-signs in on their next guarded-route navigation. Alternatives rejected: silent token refresh via Hanko's refresh endpoint (Hanko's documented refresh API surface is not stable enough at this WP's draft time to commit to; a future hardening WP can layer this in); force-redirect-to-login on expiry (surprise navigation in the middle of a user interaction is worse than the 401 banner).

**D-16006 — First-sign-in auto-provisioning: piggybacks on the first authenticated request to any existing route.** WP-131's `productionAccountResolver` already provisions `legendary.players` rows on first authenticated call. The client's sign-in flow ends with a navigation to the returnTo route (typically `?route=me`); the first `GET /api/me/profile` call triggers the provision. Alternatives rejected: a new bootstrap endpoint (duplicates WP-131); a server-side `/api/me/bootstrap` round-trip on sign-in success (extra latency for no UX benefit; the user is about to load `/api/me/profile` anyway).

**D-16007 — Route guard scope: only `'me'` and `'admin-billing'` are guarded; `'fixture' | 'live' | 'lobby' | 'profile' | 'login'` are unguarded.** Gameplay (`live`) uses boardgame.io credentials (a separate auth concern on the WS transport); profile-view (`profile`) is intentionally public-readable per WP-102; lobby and fixture are dev/landing surfaces. Alternatives rejected: gateguard `live` (would require coordinating with WP-090's WS transport — out of scope); guard `profile` (would break WP-102's public-readable contract).

**D-16008 — Sign-in surface placement: dedicated `?route=login` route with `returnTo` parameter.** Mirrors the existing closed-set route discriminator in App.vue. Alternatives rejected: always-present modal (clutters the gameplay UI); triggered on first 401 (delayed UX feedback; user has already attempted an action when the modal appears); landing-page banner (poor discoverability — players who navigate directly to `/me` would never see a banner on the lobby).

**D-16009 — Failure modes: static "Sign-in is temporarily unavailable" banner; `[auth]`-tagged console.warn with no payload.** Hanko widget errors (invalid email, OTP failed) are owned by the widget. Our error surfaces are: tenant unreachable, JWKS down, register() rejected. All produce the same static banner — the user does not need to distinguish operational categories. Alternatives rejected: detailed error display (leaks operational details to the player — a §3 violation); silent failure (worse UX than the banner).

**D-16010 — Client config: `VITE_HANKO_TENANT_BASE_URL` (build-time, mirrors `VITE_SERVER_URL`).** Vite inlines at build time; matches the existing client-env precedent. Alternatives rejected: runtime fetch from a `/config` endpoint (extra round-trip on every page load); hardcoded URL in source (per-environment override impossible without a code change).

**D-16011 — Cross-repo: marketing site at `C:\www\legendary-arena-com` is OUT OF SCOPE.** The arena-client SPA is the sole sign-in surface. A follow-up marketing WP can add a "Sign in" link to the marketing nav if desired. Alternatives rejected: bundle a marketing-site sign-in link into this WP (cross-repo touch expands the scope; the marketing site has its own governance; the sign-in flow lives on the SPA regardless of where the link lives).

---

## Out of Scope

- The cutover of WP-110's `/api/admin/billing/history` route from `X-Admin-Secret` to `admin-session-required` (separate follow-up swap WP per WP-159 §Out of Scope).
- Any WP-107 profile-integrity admin UI (ships in WP-107's own client surface).
- A "Sign in" link on the marketing site (`C:\www\legendary-arena-com`) — separate cross-repo WP.
- Customization of the Hanko-hosted flow (passkey opt-out, federation provider toggles, OTP-vs-passkey priority, branding) — the widget's defaults are accepted as-is.
- Silent token refresh via Hanko's refresh endpoint — Hanko's documented refresh API is not stable enough at this WP's draft time; a future hardening WP can layer this in if needed.
- A `<hanko-profile>` integration. `MyProfilePage.vue` already owns the owner-edit surface (WP-104); mounting `<hanko-profile>` would duplicate.
- Sign-up versus sign-in differentiation (the Hanko widget handles both in one flow).
- Auth integration with the boardgame.io live-match transport (the `?credentials=` query param on `?route=live` is unchanged — that's a separate concern from Hanko HTTP-API tokens).
- E2E browser tests of the actual Hanko widget. The widget's behavior is owned by Hanko; our tests verify the wrapper's contract via the `__hankoFactory` seam.
- A `useAuthStore`-driven reactive global guard on App.vue (would convert the one-shot setup-time guard into a reactive watch — useful in a future WP that adds `vue-router`, out of scope here).
- A typed surface for the Hanko event payload. We re-read `getSessionToken()` rather than parsing event payloads, deliberately decoupling from the broker's event-shape evolution.
- Anything that touches `packages/game-engine/`, `packages/registry/`, `packages/preplan/`, or any server file under `apps/server/src/**`.

---

## Files Expected to Change

**New (5):**
- `apps/arena-client/src/auth/hankoClient.ts` — new — Hanko SDK wrapper (4 functions + 2 interfaces + 1 error class)
- `apps/arena-client/src/auth/hankoClient.test.ts` — new — 8 unit tests; uses `__hankoFactory` injection seam; no `@teamhanko/*` import at test time
- `apps/arena-client/src/stores/auth.ts` — new — Pinia auth store (3 state fields, 3 actions, `isAuthenticated` derived)
- `apps/arena-client/src/stores/auth.test.ts` — new — 7 unit tests; pure Pinia, no Hanko surface
- `apps/arena-client/src/pages/LoginPage.vue` — new — hosts `<hanko-auth>`, handles `returnTo`, four-state visual lifecycle

**Modified (5):**
- `apps/arena-client/package.json` — modified — add `@teamhanko/hanko-elements: ^2.4.0` under `dependencies`
- `apps/arena-client/.env.example` — modified — add `VITE_HANKO_TENANT_BASE_URL` block
- `apps/arena-client/src/App.vue` — modified — extend `AppRoute` with `'login'`; add `loginRoute` + `returnTo` to `ParsedQuery`; route-guard logic for `me` and `admin-billing`; LoginPage slot
- `apps/arena-client/src/main.ts` — modified (likely byte-identical) — listed defensively in case execution discovers an SSR / hook-order concern; if no change needed, removed from the executed diff per §Acceptance Criteria
- `apps/arena-client/src/pages/MyProfilePage.vue` — modified — replace `readAuthToken()` localStorage read with `useAuthStore().token`; add "Sign out" button + handler; new `ensureHankoHandle()` lazy initializer

**Governance (4):**
- `docs/ai/work-packets/WORK_INDEX.md` — modified — add WP-160 row under Phase 7 Auth Stack; dependency-chain note
- `docs/ai/execution-checklists/EC_INDEX.md` — modified — add EC-174 row mapping to WP-160 (Draft)
- `docs/05-ROADMAP-MINDMAP.md` — modified — add WP-160 📝 to Auth Stack & Profile Surface cluster; update Last Updated footer (do NOT bump done counts)
- `docs/ai/DECISIONS.md` — modified — append D-16001..D-16011 (drafted; flip to Active at execution close)

**14 files total.** Above the §00.1 single-session ~8-file cap, defensible per the WP-157 (Dashboard Scaffold) precedent — the contract surface is tightly coupled and splitting introduces an artificial drift window with no diagnostic benefit. The breakdown: 10 source files + 4 governance files; the governance files are mechanical (rows in indices, decisions appended) and the source files are 4 wrapper-shape files (2 tests + 2 implementations under `src/auth/` and `src/stores/`), 1 new page, 1 single-line-of-real-change `package.json`, 1 single-line `.env.example`, 1 multi-edit `App.vue` (route discriminator), 1 multi-edit `MyProfilePage.vue` (cutover), and 1 likely-no-op `main.ts`.

---

## Contract

> **Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - ESM only, Node v22+
> - Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
> - Read-only at the engine / registry / server surface — zero modifications outside `apps/arena-client/` + the four governance files listed above
> - One new npm dependency only: `@teamhanko/hanko-elements @ ^2.4.0`
> - No new dev dependencies
> - One new build-time env var only: `VITE_HANKO_TENANT_BASE_URL`

---

## Acceptance Criteria

- [ ] `apps/arena-client/src/auth/hankoClient.ts` exports `initializeHankoClient`, `getCurrentTokenFromHandle`, `signOutCurrentSession`, `subscribeToSessionEvents`, `HankoClientHandle`, `HankoSessionListeners`, `HankoInitializationFailed` per §Locked Values (verified by `grep -n 'export ' apps/arena-client/src/auth/hankoClient.ts | wc -l ≥ 7`).
- [ ] `apps/arena-client/src/stores/auth.ts` exports `useAuthStore` with state shape `{ token, accountId, isAuthenticated }` and actions `setSession`, `clearSession`, `bootstrapFromCachedToken` (verified by tests B + D in §Scope above).
- [ ] `isAuthenticated` is a `ComputedRef<boolean>` derived from `token`, NOT a separately-settable `Ref<boolean>` (verified by TypeScript compile + a type-only comment in `auth.test.ts`).
- [ ] `apps/arena-client/src/pages/LoginPage.vue` mounts exactly one `<hanko-auth>` element when `state === 'ready'`; mounts zero elements in `initializing`, `unavailable`, `signing-out` states (verified by grep for `<hanko-auth` returning exactly 1 match in the file).
- [ ] `apps/arena-client/src/pages/LoginPage.vue` exposes the exact closed-set state `'initializing' | 'ready' | 'unavailable' | 'signing-out'` and uses the exact failure-banner copy `"Sign-in is temporarily unavailable. Please try again later."` (verbatim match).
- [ ] `apps/arena-client/src/App.vue` `AppRoute` union includes `'login'` exactly once; `selectRoute` precedence is `admin-billing > me > login > profile > fixture > live > lobby` (verified by reading the file's selectRoute body).
- [ ] `apps/arena-client/src/App.vue` route-guard logic redirects unauthenticated `me` / `admin-billing` navigations to `LoginPage` via local-route mutation (NOT a URL change at this stage). The user's URL bar at first render still reads `?route=me`; only the rendered component differs.
- [ ] `apps/arena-client/src/pages/MyProfilePage.vue` `readAuthToken()` reads from `useAuthStore().token` (not from `window.localStorage.getItem('authToken')`). Repo-wide grep for `localStorage.getItem('authToken')` returns zero matches across `apps/arena-client/src/**`.
- [ ] `apps/arena-client/src/pages/MyProfilePage.vue` has a "Sign out" button whose click handler calls `signOutCurrentSession(handle)` then `useAuthStore().clearSession()` then `window.location.assign('?route=')`.
- [ ] `apps/arena-client/package.json` includes `@teamhanko/hanko-elements` at `^2.4.0` under `dependencies`. No `@teamhanko/*` package appears under `devDependencies`.
- [ ] `apps/arena-client/.env.example` documents `VITE_HANKO_TENANT_BASE_URL`.
- [ ] No file outside `apps/arena-client/src/auth/` imports `@teamhanko/*` (verified by `grep -rn "@teamhanko/" apps/arena-client/src --include="*.ts" --include="*.vue"` — only `hankoClient.ts` matches; the test file `hankoClient.test.ts` MUST NOT import the real package at test time, only `import type` declarations are acceptable for the `HankoLike` test fake).
- [ ] The literal string `'hanko'` (single-quoted) does NOT appear in any new client source file as an `auth_provider` enum value, store-key value, fixture value, or stored-string value. Permitted appearances per §Packet-specific — broker invisibility are exempt.
- [ ] `apps/arena-client/src/stores/auth.ts` does NOT import `@teamhanko/*` (the store is broker-agnostic).
- [ ] `apps/arena-client/src/pages/LoginPage.vue` does NOT import `@teamhanko/*` directly (the page consumes the wrapper).
- [ ] All test files pass: `pnpm --filter @legendary-arena/arena-client test` exits 0. New tests: 8 in `hankoClient.test.ts` + 7 in `auth.test.ts` = 15 new tests. Baseline before this WP + 15 = post-WP arena-client test count.
- [ ] No `Math.random()`, no `Date.now()`, no wall-clock reads in any new file under `apps/arena-client/src/auth/` or `apps/arena-client/src/stores/auth.ts` (verified by grep).
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0 with no `Boundary Leakage` error from the Vite `failOnNodeExternalization` plugin (verified — if a `node:*` import sneaks in via a Hanko transitive dep, the build hard-fails per D-14401).
- [ ] `apps/arena-client/src/main.ts` is byte-identical to its pre-WP form OR the diff is documented in the post-execution STATUS update with a one-sentence rationale.

---

## Verification Steps

```pwsh
# All arena-client tests pass (baseline TBD by execution session; expect +15 new tests)
pnpm --filter @legendary-arena/arena-client test

# Hanko wrapper exported with correct surface
Select-String -Path "apps\arena-client\src\auth\hankoClient.ts" -Pattern "^export "
# Expected: at least 7 matches (4 functions + 2 interfaces + 1 error class)

# Auth store exposes the three actions
Select-String -Path "apps\arena-client\src\stores\auth.ts" -Pattern "setSession|clearSession|bootstrapFromCachedToken"
# Expected: at least 3 matches (one per action declaration; more if tests share the file — but tests live in auth.test.ts)

# Pinia store id is 'auth'
Select-String -Path "apps\arena-client\src\stores\auth.ts" -Pattern "defineStore\('auth'"
# Expected: 1 match

# LoginPage mounts exactly one <hanko-auth> element
Select-String -Path "apps\arena-client\src\pages\LoginPage.vue" -Pattern "<hanko-auth"
# Expected: 1 match

# LoginPage uses the exact failure-banner copy
Select-String -Path "apps\arena-client\src\pages\LoginPage.vue" -Pattern "Sign-in is temporarily unavailable\. Please try again later\."
# Expected: 1 match

# App.vue extended with login route
Select-String -Path "apps\arena-client\src\App.vue" -Pattern "'login'"
# Expected: at least 2 matches (AppRoute union + selectRoute branch)

# MyProfilePage no longer reads from localStorage for authToken
Get-ChildItem apps/arena-client/src -Recurse -Include *.ts,*.vue | Select-String -Pattern "localStorage.getItem\('authToken'\)|localStorage.getItem\(`"authToken`"\)"
# Expected: no matches

# MyProfilePage reads from the Pinia store
Select-String -Path "apps\arena-client\src\pages\MyProfilePage.vue" -Pattern "useAuthStore\(\)\.token"
# Expected: at least 1 match

# Sign-out button present
Select-String -Path "apps\arena-client\src\pages\MyProfilePage.vue" -Pattern "Sign out"
# Expected: at least 1 match (button label, verbatim per Locked Values)

# Hanko-Elements added to package.json
Select-String -Path "apps\arena-client\package.json" -Pattern '"@teamhanko/hanko-elements"'
# Expected: 1 match (under "dependencies")

# Hanko-Elements NOT under devDependencies
$pkg = Get-Content apps\arena-client\package.json -Raw | ConvertFrom-Json
$pkg.devDependencies.PSObject.Properties | Where-Object { $_.Name -like '@teamhanko/*' }
# Expected: empty

# Build-time env var documented
Select-String -Path "apps\arena-client\.env.example" -Pattern "VITE_HANKO_TENANT_BASE_URL"
# Expected: at least 1 match

# Only the wrapper file imports @teamhanko/*
Get-ChildItem apps/arena-client/src -Recurse -Include *.ts,*.vue | Select-String -Pattern "from '@teamhanko/" | Where-Object { $_.Path -notmatch "auth\\hankoClient\.ts$" }
# Expected: no matches (the test file uses type-only imports if any; production code is single-file-isolated)

# Auth store is broker-agnostic
Select-String -Path "apps\arena-client\src\stores\auth.ts" -Pattern "@teamhanko/|hanko"
# Expected: no matches

# LoginPage does not import @teamhanko/* directly
Select-String -Path "apps\arena-client\src\pages\LoginPage.vue" -Pattern "from '@teamhanko/"
# Expected: no matches

# No clock / RNG reads in new auth code
Select-String -Path "apps\arena-client\src\auth\hankoClient.ts","apps\arena-client\src\stores\auth.ts" -Pattern "Math\.random|Date\.now|performance\.now|new Date\("
# Expected: no matches

# Build passes (the failOnNodeExternalization guard at vite.config.ts:22 hard-fails on node:* leakage)
pnpm --filter @legendary-arena/arena-client build
# Expected: exit code 0; no "Boundary Leakage detected" thrown

# Hanko broker invisibility check — 'hanko' as a quoted enum / store-key value
Get-ChildItem apps/arena-client/src -Recurse -Include *.ts,*.vue | Select-String -Pattern "'hanko'|`"hanko`""
# Expected: no matches (the package name @teamhanko/hanko-elements is import-only, not quoted; the env var name VITE_HANKO_TENANT_BASE_URL is identifier-only, not quoted)
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-16001..D-16011 (each entry: Decision, Rationale, Alternatives Rejected — minimum 3 alternatives per entry where the design space supports it)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-160 marked `[x]` with the post-execution one-line summary
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-174 flipped to `Done` with execution date
- [ ] `docs/05-ROADMAP-MINDMAP.md` updated: WP-160 ✅ on the Auth Stack & Profile Surface cluster; Progress Summary done count bumped; Last Updated footer current
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 NOT INVOKED (no engine, registry, scoring, or replay surface touched)
- [ ] 01.6 post-mortem MANDATORY (new long-lived abstraction: the Pinia auth store + Hanko SDK wrapper become the canonical seam for every future authenticated client surface; mirror the WP-112 + WP-126 server-side post-mortem discipline)

---

## Lint Gate Self-Review

Run per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (21 sections). All sections PASS or N/A-justified.

| § | Status | Note |
|---|--------|------|
| §1 Structure | PASS | All 10 required sections present and non-empty (Goal / Assumes / Context / Scope In / Out of Scope / Files Expected to Change / Non-Negotiable Constraints / Acceptance Criteria / Verification Steps / Definition of Done) |
| §2 Non-Negotiable Constraints | PASS | Engine-wide block requires full file contents, forbids diffs, states ESM + Node v22+, references `00.6-code-style.md`. Packet-specific blocks cover broker invisibility, auth store contract, SDK wrapper contract, LoginPage contract, sign-in/sign-out flow, MyProfilePage cutover, App.vue route, package/config discipline, test discipline. Session protocol present. Locked Values populated |
| §3 Prerequisites (`## Assumes`) | PASS | Lists every prior WP (10), every external state (Render env, Cloudflare Pages env, Hanko tenant), every file the packet depends on with the expected export shape, and every line-pinned reference (`MyProfilePage.vue:121-132`, `App.vue:49`, etc.) |
| §4 Context References | PASS | Cites specific REFERENCE docs by section number, specific DECISIONS by ID, specific WPs, and reads the Hanko web-references read-only |
| §5 Output Completeness | PASS | All 14 files listed with `— new` / `— modified` marker; each has a one-line description; no "update this section" / "show the diff" / "add the following" language anywhere; the §00.1 ~8-file cap exceeded but defensible per WP-157 precedent (rationale in body) |
| §6 Naming Consistency | PASS | `auth_provider` / `auth_provider_id` / `ext_id` field names match 00.2; no MatchSetup field names referenced; no typos in file paths |
| §7 Dependency Discipline | PASS | New dep: `@teamhanko/hanko-elements ^2.4.0` (exact range stated, under `dependencies`, package.json update required, full file required as output). Forbidden packages excluded: no axios / node-fetch / Jest / Vitest / Mocha / Passport / Auth0 / Clerk. The §7 Hanko exception applies (broker code confined to `auth/hankoClient.ts` mirroring the server-side `auth/hanko/` lock) |
| §8 Architectural Boundaries | PASS | App layer only. No engine import. No server import. No registry runtime import. No `pg` import. No PostgreSQL. No `G` / `ctx` access. No moves. The `failOnNodeExternalization` Vite guard preserves the D-14401 boundary at build time. The broker-invisibility discipline mirrors the server-side D-9904 module-path lock at the client boundary |
| §9 Windows Compatibility | PASS | All Verification Steps use PowerShell (`Select-String`, `Get-ChildItem`, `ConvertFrom-Json`); no bash, no Linux-only path assumptions |
| §10 Env Var Hygiene | PASS | `VITE_HANKO_TENANT_BASE_URL` documented in `.env.example`, sourced from Cloudflare Pages env at build time. No real secrets in output. No JWT_SECRET in scope (server-side) |
| §11 Authentication Clarity | PASS | Option A — Dual token: boardgame.io `credentials` field on `?route=live` (unchanged, used for WS transport) + Hanko JWT for HTTP `/api/me/*` (new, this WP). Both are bearer-style; they do not interact. The `## Limitations` section is folded into the `## Session Context` block (scope-excluded items) — listing what the system does NOT protect against: silent refresh, marketing-site sign-in, sign-up customization, admin-secret cutover. JWT_SECRET startup guard exists server-side (WP-131) — N/A for this client WP |
| §12 Test Quality | PASS | All tests use `node:test` + `node:assert`. No `boardgame.io` imports in new test files. No network. No DB. The `__hankoFactory` injection seam keeps `@teamhanko/hanko-elements` out of test bundles. No `makeMockCtx` references — this WP does not produce game-engine tests |
| §13 Verification Steps | PASS | All commands use `pnpm`; every grep has an expected match count; no "run and verify manually" steps |
| §14 Acceptance Criteria | PASS | 18 binary, observable items. Each references actual file paths and function/export names. No "works correctly" language. Aligned with the deliverables; no phantom checks |
| §15 Definition of Done | PASS | Includes acceptance-criteria pass; STATUS.md; DECISIONS.md (D-16001..D-16011); WORK_INDEX.md; EC_INDEX.md; ROADMAP-MINDMAP.md; scope-boundary check; 01.5 NOT INVOKED declaration; 01.6 post-mortem mandatory declaration |
| §16 Code Style (junior maintainability) | PASS | The WP body sets expectations for the executor: small functions, JSDoc on every export, full English names, no `import *`, no barrel files, full-sentence error messages, `// why:` comments on non-obvious control flow. Specific examples folded into the §A/§E/§H scope blocks |
| §17 Vision Alignment | PASS | Vision clauses cited (§3 Player Trust & Fairness, §11 Player Identity, §14 Explicit Decisions). Conflict assertion: no conflict. Non-Goal proximity check: NG-1 through NG-7 N/A. Determinism preservation: N/A (touches no scoring/replay/RNG surface) |
| §18 Prose-vs-Grep | PASS | The verification grep for `'hanko'` / `"hanko"` excludes the package name `@teamhanko/hanko-elements` (which appears only in `import` statements, not as a quoted string) and the env var `VITE_HANKO_TENANT_BASE_URL` (an identifier). Prose discussing the broker paraphrases ("the authentication broker", "the broker") per §18 discipline; the literal `'hanko'` appears only in (a) the file's `@teamhanko/hanko-elements` import path, (b) the storage-key value `'cookie'` discussion (not quoted as a broker name), (c) DECISIONS citations |
| §19 Bridge-vs-HEAD Staleness | PASS | This WP is not a repo-state-summarizing artifact. The §Assumes block pins `origin/main @ 295eec6` as the drafting baseline for line-number citations; if execution discovers the baseline has moved, the WP's line-number references re-verify against the new HEAD (or surface a STOP per Session Protocol) |
| §20 Funding Surface Gate | N/A | WP-160 introduces only a sign-in surface. None of §20.1 triggers fire: no global-nav funding affordance, no registry-viewer funding affordance, no profile/account funding attribution, no tournament funding integration, no user-visible donate/support copy (the LoginPage's only project-owned copy is the page header and a transport-failure banner — neither references funding). Carve-out per §20.1 governance-doc exclusion: this WP cites WP-097 / §20 itself nowhere except inside this lint-gate row. Justification per §20.1: client-only WP whose only user-visible copy is a sign-in page header and a static transport-failure banner; no funding channel, donation surface, or supporter affordance referenced |
| §21 API Catalog Update | N/A | WP-160 is client-only. No file under `apps/server/src/**` is added, modified, or removed. No HTTP endpoint is added, modified, removed, or status-changed. No `Library-only` library function reachable via direct import from `apps/server/src/**` is touched. The Auth taxonomy in `docs/ai/REFERENCE/api-endpoints.md` (5 closed-set values, last extended by WP-159) is unchanged — no new value introduced; no existing `authenticated-session-required` row gains or loses an annotation because the catalog records what each endpoint *requires* (a static property of the endpoint), not which clients can satisfy that requirement. Justification: client-only governance + implementation WP; no `apps/server/src/**` library functions added or modified; no HTTP endpoint surface touched |

**Final Gate result: PASS.** Zero ❌ FAIL conditions trigger. §20 and §21 are explicitly N/A-justified per §20.1 / §21.4 (one-line justification naming the reason, not a tautological placeholder).

---

## Pre-Flight Verdict

**Verdict: READY TO EXECUTE.**

Per `docs/ai/REFERENCE/01.4-pre-flight-invocation.md`, the pre-flight summary:

- **Work Packet Class:** Runtime Wiring (limited runtime wiring based on existing contracts: extends App.vue route discriminator, wires a Pinia store into existing API call sites, mounts a new page; does NOT mutate `G`, does NOT introduce engine logic)
- **Dependency Check:** PASS. All 10 prerequisites (WP-099, WP-101, WP-104, WP-106, WP-108, WP-112, WP-126, WP-131, WP-132, WP-133, WP-052, WP-090) are `[x]` on `origin/main @ 295eec6` per WORK_INDEX.md verification.
- **Input Data Traceability:** PASS. The Hanko bearer token's origin (broker-issued JWT, validated by WP-126's verifier, account-resolved by WP-131's `productionAccountResolver`) is fully traced through the server-side stack; the client's role is purely to transport.
- **Structural Readiness:** PASS. The file-structure pattern (Pinia store + page + wrapper) matches the existing `MyProfilePage.vue` / `BillingSection.vue` / `ownerProfileApi.ts` shape. Pinia is bootstrapped. The `?route=` closed-set extends cleanly. The `failOnNodeExternalization` guard catches any boundary regression at build time.
- **Scope Lock:** PASS. Files explicitly enumerated. Out-of-scope items enumerated (12 items). No engine / registry / server surface touched. Marketing repo touched: zero files. The §00.1 ~8-file cap is exceeded (14 files) but defensible per the WP-157 precedent — the scope-lock rationale is in the body.
- **Test Expectations:** PASS. +15 new tests (8 wrapper + 7 store). Baseline arena-client test count TBD by execution session; new tests must all pass.
- **Risk Review:** Three RISKs identified, each scope-neutral and mitigated inline:
  - **RISK 1: Hanko SDK API drift between draft and execution.** Mitigated by the Session Protocol STOP condition: if `@teamhanko/hanko-elements @ ^2.4.0`'s API surface has shifted (e.g., `getSessionToken` renamed), STOP and re-open framing.
  - **RISK 2: Vite `failOnNodeExternalization` hard-fail on Hanko transitive deps.** Mitigated by Session Protocol STOP condition: if `pnpm install` produces a `node:*` externalization warning, STOP and triage before merge. The Vite plugin is the authority; the dep is the variable.
  - **RISK 3: Browser cookie behavior differences across browsers (Safari ITP, Firefox tracking-protection, etc.).** Mitigated by `D-16002` — cookie storage is Hanko's default and the broker owns cookie-attribute decisions. If a player's browser blocks the Hanko cookie, the sign-in attempt simply fails and the static banner appears; we don't silently swallow the failure. A future hardening WP can add a sessionStorage fallback if browser-compat issues surface in field testing.
- **Runtime Readiness Check:** PASS. The `failOnNodeExternalization` guard preserves the runtime boundary. The token-attachment path (Pinia → API client → `fetch`) does not introduce any new error path beyond the existing ones (the API clients already handle `authToken === null`).
- **Maintainability & Upgrade Readiness:** PASS. The broker-invisibility discipline (`@teamhanko/*` confined to `auth/hankoClient.ts`; broker name absent as a quoted enum value; the Pinia store stores `string` not `HankoLike`) makes a future broker swap a single-file replacement plus a custom-element-tag rename. The auth store's `accountId: string | null` lag is documented for the day-one shape; a future consumer needing `accountId` can extend the bootstrap call chain without changing the store's shape.

Pre-flight produced no PS-items (blocking) and no RS-items (clarifying) that require resolution before execution. Three RISKs documented inline with explicit mitigations.

---

## Copilot Check Verdict

**Verdict: PASS** (per `docs/ai/REFERENCE/01.7-copilot-check.md`).

Reviewed against the 30 failure-mode lens:

| Lens | Status | Note |
|---|---|---|
| Determinism / RNG | PASS | No engine touch; no replay impact |
| Persistence boundaries | PASS | Token stored in broker cookie (broker-owned); Pinia store is in-process |
| Layer boundaries | PASS | App layer only; no engine/server/registry runtime import |
| Type drift | PASS | Pinia store state shape locked in §Locked Values; SDK wrapper surface locked |
| Closed-union drift | PASS | `AppRoute`, `LoginPage` state, `HankoSessionListeners` closed sets; bidirectional discipline matches WP-159 precedent |
| Caller-injected provider seam | PASS | The `__hankoFactory` seam mirrors D-12603 / D-11201 server-side discipline |
| Error contract | PASS | `HankoInitializationFailed` typed; sign-out rejection propagates; no silent swallows except the documented one in `MyProfilePage.signOut()` with `// why:` comment |
| Test isolation | PASS | Tests use `__hankoFactory`; no real `@teamhanko/*` import at test time; no network; no DB |
| API contract changes | PASS | Existing API clients unchanged at the type level (still `authToken: string | null`); only the *source* of the token changes |
| Catalog discipline (§21) | PASS | N/A justified per §21.4 (client-only WP; no `apps/server/src/**` touch) |
| Vision alignment (§17) | PASS | §3 / §11 / §14 cited; NG-1..7 N/A; determinism N/A |
| Funding gate (§20) | PASS | N/A justified per §20.1 carve-out (sign-in surface, not funding surface) |
| Lint structure (§1-§16) | PASS | All sections present; constraints reference 00.6; verification deterministic |
| 01.5 invocation | PASS | NOT INVOKED — no engine surface; explicit declaration in §Definition of Done |
| 01.6 post-mortem | PASS | MANDATORY — declared in §Definition of Done; new long-lived auth seam at the client boundary |
| File-count discipline | RISK→ACCEPTED | 14 files exceeds the ~8 cap; defended in §Files Expected to Change body and §Scope-Lock pre-flight item; the WP-157 precedent (Dashboard Scaffold, ~25 files) is the named reference for "tightly-coupled client scaffolding ships in one WP" |
| Hanko broker invisibility (F-1 / F-2) | PASS | Discipline extended from server (D-9904) to client (this WP's §Packet-specific block); verified by Acceptance Criteria + Verification Steps grep |
| Browser-compat risk | RISK→ACCEPTED | Documented in pre-flight Risk Review; mitigation via static banner on cookie failure; future hardening WP if field-testing surfaces issues |
| SDK API drift risk | RISK→ACCEPTED | Documented in pre-flight Risk Review; Session Protocol STOP condition if API surface shifts between draft and execution |

Three RISKs identified; each is scope-neutral and mitigated inline. No BLOCK conditions. No SUSPEND conditions.

---

## Notes for Execution Session

- The execution session is a SEPARATE Claude Code session per `01.0a §two-session pattern`. It reads the session-prompt scratchpad at `docs/ai/invocations/session-wp160-hanko-client-ui.md` (gitignored per `.claude/rules/work-packets.md`) for the operator's brief.
- The execution session must respect Session Protocol STOPs: API drift, Vite boundary hard-fail, missing `@teamhanko/hanko-elements @ ^2.4.0`. Each STOP routes back to the drafting session, not a workaround.
- The 01.5 cascade is NOT invoked. The engine surface is not touched.
- The 01.6 post-mortem IS mandatory. The Pinia auth store + Hanko SDK wrapper become the canonical client-side auth seam — the rationale, the open questions, the field-test feedback all need to be captured for the next auth-related client WP.
