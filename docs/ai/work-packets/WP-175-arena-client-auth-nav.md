# WP-175 — Arena Client Auth-Aware Navigation Surface

**Status:** Draft
**Layer:** apps/arena-client (client-only)
**Hard-deps:** WP-160 (Hanko client UI), WP-174 (first-sign-in auto-provisioning)
**Baseline:** `origin/main` @ `08a092c` (2026-05-24, post-WP-174 merge)

---

## Goal

Add an auth-aware navigation element to the arena-client `BrandHeader` so
that:

- **Signed-out visitors** see a discoverable "Sign in" link that navigates
  to `?route=login`, preserving the current route as `returnTo` per WP-160's
  existing `LoginPage.vue` pattern.
- **Signed-in users** see their display name (or a truncated-email
  fallback), a "My profile" link to `?route=me`, and a "Sign out" control
  that reuses `signOutCurrentSession` from `auth/hankoClient.ts` (byte-identical
  to the `MyProfilePage.vue` sign-out flow per D-16004).
- **During auth bootstrap** the nav shows a minimal skeleton placeholder
  (the signed-out state is NOT flashed; the placeholder prevents
  flash-of-unauthenticated-content until `isAuthBootstrapping` resolves).

This closes the UX gap surfaced during WP-107 PS-1 verification on
2026-05-24: the lobby has no discoverable path to the sign-in flow,
and a signed-in user has no visible sign-out control outside
`MyProfilePage.vue`.

---

## Assumes

- **WP-160** ✅ — `LoginPage.vue`, `stores/auth.ts` (Pinia auth store),
  `auth/hankoClient.ts` (SDK wrapper with `signOutCurrentSession`),
  route guards in `App.vue`, `returnTo` parameter on `LoginPage` — all
  shipped and on `main`.
- **WP-174** ✅ — First-sign-in auto-provisioning; D-17401 supersedes
  D-16006. The `accountId` lag-field on the auth store is populated
  by the server's account resolver after the first `/api/me/profile` call,
  not at sign-in time.
- **WP-161** ✅ — `buildApiUrl` helper at
  `apps/arena-client/src/lib/api/apiBaseUrl.ts`, used by all API client
  files.
- **`Header.vue`** exists at
  `apps/arena-client/src/components/branding/Header.vue` and renders
  the wordmark + a `<nav>` with "Home" and "Cards" links. No auth
  awareness today.
- **`AppShell.vue`** wraps `<BrandHeader />` + slot + `<BrandFooter />`.
  The header renders on every route.
- **Pinia auth store** exposes: `token` (Ref<string | null>),
  `accountId` (Ref<string | null>), `isAuthenticated`
  (ComputedRef<boolean>), `setSession`, `clearSession`,
  `bootstrapFromCachedToken`. No `displayName` field today.
- **`ownerProfileApi.ts`** exposes `fetchOwnerProfile(token)` which
  returns the owner profile including `handle` and `displayName`
  (the latter from the DB `legendary.players.display_name`).
- **`isAuthBootstrapping`** ref exists in `App.vue` setup — it is
  `true` when the user lands on a guarded route (`me`, `admin-billing`)
  until the broker bootstrap resolves. It is NOT currently exposed
  outside `App.vue`.

---

## Context (Read First)

1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md` — §Layer Boundary (this WP touches
   `apps/arena-client/` only; no server, engine, or registry changes)
3. `.claude/rules/architecture.md` — import rules for `apps/arena-client`
4. `.claude/rules/code-style.md` — naming, JSDoc, comments
5. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code
6. `docs/ai/work-packets/WP-160-hanko-client-ui.md` — the auth stack
   this WP composes against; §C (auth store contract), §E (LoginPage),
   §G (MyProfilePage sign-out)
7. `docs/ai/DECISIONS.md` — D-16001..D-16011 (WP-160 lock set);
   D-16004 (sign-out semantics: navigate to lobby);
   D-16007 (route-guard scope);
   D-16008 (login route placement at `?route=login`);
   D-17401..D-17406 (WP-174 provisioning decisions)
8. `apps/arena-client/src/components/branding/Header.vue` — current nav
9. `apps/arena-client/src/stores/auth.ts` — Pinia auth store
10. `apps/arena-client/src/auth/hankoClient.ts` — broker SDK wrapper
11. `apps/arena-client/src/pages/LoginPage.vue` — returnTo handling
12. `apps/arena-client/src/pages/MyProfilePage.vue` — sign-out precedent
13. `apps/arena-client/src/App.vue` — route discriminator,
    `isAuthBootstrapping`

---

## Scope (In)

1. **Modify `Header.vue`** — extend the `<nav>` with an auth-aware
   right-side section. Signed-out: "Sign in" link. Signed-in: display
   name + "My profile" link + "Sign out" button. Bootstrapping: a
   text placeholder ("...").

2. **Add `useAuthNav` composable** at
   `apps/arena-client/src/composables/useAuthNav.ts` — encapsulates
   the auth-nav's reactive state: reads `useAuthStore()` for
   `isAuthenticated` and `token`; lazily fetches the user's display
   name from `/api/me/profile` on first authenticated render; exposes
   `displayLabel` (ComputedRef<string>), `isSignedIn`
   (ComputedRef<boolean>), `isBootstrapping` (Ref<boolean>), and
   `signOut()` action.

3. **Display name strategy:** The composable calls
   `fetchOwnerProfile(token)` once on first authenticated mount.
   On success, it stores `displayName` (or `handle` fallback, or
   truncated email local-part fallback) in a local ref. On failure,
   it falls back to "My account". The display name is NOT persisted
   in the Pinia auth store — extending the store's shape is out of
   scope for this WP. The fetch is fire-and-forget; the nav renders
   "My account" immediately and upgrades to the display name when
   the fetch resolves.

4. **Sign-out from nav:** byte-identical to `MyProfilePage.vue`'s
   `signOut()` flow: `ensureHankoHandle()` →
   `signOutCurrentSession(handle)` → `clearSession()` →
   `window.location.assign('?route=')`. The existing
   `ensureHankoHandle` memoization in `MyProfilePage.vue` is
   extracted to a shared module-scope helper (or the composable
   re-instantiates — the broker SDK initialization is idempotent
   per D-16005).

5. **Sign-in link:** `<a href="?route=login">Sign in</a>`. No
   `returnTo` parameter from the nav — the user clicks "Sign in"
   from whatever route they're on; after sign-in, `LoginPage.vue`'s
   existing `returnTo` validation only accepts guarded routes (`me`,
   `admin-billing`). A non-guarded `returnTo` falls back to lobby,
   which is the correct post-sign-in destination for a user who was
   browsing the lobby.

6. **Bootstrapping state:** The nav reads `isAuthBootstrapping` to
   decide whether to show the placeholder. Currently
   `isAuthBootstrapping` is a local ref inside `App.vue` setup. Two
   options:
   - **(A) Provide/inject:** `App.vue` provides
     `isAuthBootstrapping` via Vue's `provide()`; `Header.vue`
     injects it. Minimal change, no store extension.
   - **(B) Auth store extension:** add `isBootstrapping` to the
     Pinia store.

   **Decision (D-17501):** Option A (provide/inject). The
   bootstrapping state is a transient app-lifecycle concern, not
   a durable auth-session property. It belongs in the component
   tree's provide/inject scope, not the store. The Pinia auth store
   remains unchanged (no shape extension in this WP).

7. **Responsive/mobile:** `Header.vue` has a single layout today
   (flexbox row, no breakpoints, no mobile-specific nav). The auth
   nav element follows the same pattern — it's part of the same flex
   row. No hamburger menu, no drawer. If the header wraps on narrow
   viewports, both the site nav and auth nav wrap together. A
   dedicated mobile nav is a future WP concern.

8. **Test surface:** New `useAuthNav.test.ts` + modified
   `Header.test.ts` (if one exists; otherwise new). Tests cover:
   signed-out render, signed-in render with display name, sign-out
   action, bootstrapping placeholder.

---

## Out of Scope

- **Extending the Pinia auth store** shape (no `displayName` field
  added to `stores/auth.ts`). The display name is fetched and held
  in the composable's local state.
- **Server-side changes** — no `apps/server/**` files touched. No
  new HTTP endpoints. The existing `/api/me/profile` endpoint is
  consumed read-only.
- **Engine changes** — no `packages/game-engine/**` files touched.
- **Registry changes** — no `packages/registry/**` files touched.
- **Mobile hamburger menu** — the current header has no
  mobile-specific nav surface; adding one is a separate WP.
- **Bot-watching flow auth** — the lobby's "Watch Bot Play" works
  for guests. Do not gate it on auth.
- **WP-110 admin-secret → admin-session cutover** — separate WP.
- **HANKO_JWKS_REFRESH_INTERVAL_MS production config issue** (deploy
  log shows `refresh=NaNms`) — pre-existing, unrelated.
- **Pre-existing `join-match.test.ts` baseline failure** — unrelated;
  carry-forward disposition continues.
- **`returnTo` from non-guarded routes** — the nav's "Sign in" link
  does NOT pass `returnTo`. The user lands on the lobby after
  sign-in, which is correct (the lobby is the default post-sign-in
  destination per the `LoginPage.vue` `validatedReturnTo` fallback).
- **Avatar display in nav** — out of scope; a future enhancement.

---

## Files Expected to Change

| File | Action | Notes |
|---|---|---|
| `apps/arena-client/src/components/branding/Header.vue` | Modified | Auth-aware nav section added |
| `apps/arena-client/src/composables/useAuthNav.ts` | New | Auth nav composable |
| `apps/arena-client/src/composables/useAuthNav.test.ts` | New | Composable tests |
| `apps/arena-client/src/components/branding/Header.test.ts` | New or modified | Header render tests |
| `apps/arena-client/src/App.vue` | Modified | `provide('isAuthBootstrapping', isAuthBootstrapping)` added |
| `docs/ai/DECISIONS.md` | Modified | D-17501..D-17506 landed |
| `docs/ai/work-packets/WORK_INDEX.md` | Modified | Status update |
| `docs/ai/execution-checklists/EC_INDEX.md` | Modified | Status update |

---

## Non-Negotiable Constraints

### Engine-wide

- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- Every new or modified file must be written in full — no diffs, no
  snippets, no "show only the changed section"
- `defineComponent({ setup() { return {...} } })` pattern required (NOT
  `<script setup>`) per D-6512 / P6-30 and the established arena-client
  convention

### Packet-specific

- No `apps/server/**` files touched
- No `packages/game-engine/**` files touched
- No `packages/registry/**` files touched
- No new HTTP endpoints
- No Pinia auth store shape extension (D-17501)
- `signOutCurrentSession` call must be byte-identical to the
  `MyProfilePage.vue` precedent (same try/catch fail-safe, same
  `clearSession()` + `window.location.assign('?route=')` — D-16004)
- Broker confinement: no `@teamhanko/*` imports outside
  `auth/hankoClient.ts` (F-2 gate)
- No `Math.random()`, no clock reads, no I/O in the composable
  beyond the single `fetchOwnerProfile` call

### Session protocol

- Stop and ask on unclear items
- If a decision not covered by D-17501..D-17506 arises, record it
  and ask before proceeding

### Locked contract values

- Sign-in link target: `?route=login` (D-16008)
- Sign-out destination: `?route=` (lobby) (D-16004)
- Profile link target: `?route=me`
- Bootstrapping placeholder text: `"..."` (single ellipsis, not a
  spinner or skeleton — matches the minimal-chrome convention of the
  existing `BrandHeader`)
- Display name fallback chain: `displayName` → `handle` → email
  local-part (first 16 chars) → `"My account"` (last-resort static)
- `data-testid` prefix for auth nav elements: `auth-nav-*`

---

## Acceptance Criteria

1. A signed-out user visiting `play.legendary-arena.com` sees a
   "Sign in" link in the header nav. Clicking it navigates to
   `?route=login`.
2. A signed-in user sees their display name (or fallback) in the
   header nav.
3. A signed-in user sees a "My profile" link that navigates to
   `?route=me`.
4. A signed-in user sees a "Sign out" control in the header nav.
   Clicking it signs them out and navigates to the lobby.
5. During auth bootstrap (guarded route initial load), the auth nav
   shows `"..."` instead of the signed-out or signed-in state.
6. The "Watch Bot Play" lobby button remains functional for
   unauthenticated guests (no auth gating).
7. `grep -r '@teamhanko' apps/arena-client/src/ | grep -v
   'auth/hankoClient.ts'` returns 0 matches (broker confinement).
8. `pnpm --filter @legendary-arena/arena-client typecheck` exits 0.
9. Arena-client tests pass with 0 failures.
10. `pnpm -r build` exits 0.

---

## Verification Steps

```bash
pnpm --filter @legendary-arena/arena-client typecheck
# Expected: exits 0

pnpm --filter @legendary-arena/arena-client test
# Expected: all pass, 0 fail

pnpm -r build
# Expected: exits 0

grep -r '@teamhanko' apps/arena-client/src/ | grep -v 'auth/hankoClient.ts'
# Expected: no output (0 matches)
```

---

## Definition of Done

- [ ] `Header.vue` renders auth-aware nav surface (3 states)
- [ ] `useAuthNav.ts` composable created with tests
- [ ] `App.vue` provides `isAuthBootstrapping` via `provide()`
- [ ] Sign-out from nav byte-identical to `MyProfilePage.vue` flow
- [ ] All acceptance criteria verified
- [ ] All verification steps pass
- [ ] D-17501..D-17506 landed in `DECISIONS.md`
- [ ] `WORK_INDEX.md` status updated
- [ ] `EC_INDEX.md` status updated
- [ ] `01.5` NOT INVOKED (no engine surface)
- [ ] `01.6` — evaluate; likely SKIPPED (composable is a thin
  composition of existing tested helpers; no new long-lived
  cross-layer abstraction)

---

## Lint Gate Self-Review

| § | Item | Verdict | Notes |
|---|---|---|---|
| 1 | WP Structure | ✅ PASS | All 10 required sections present |
| 2 | Non-Negotiable Constraints | ✅ PASS | Engine-wide + packet-specific + session protocol + locked values |
| 3 | Prerequisites | ✅ PASS | WP-160, WP-174, WP-161 all ✅ on main |
| 4 | Context References | ✅ PASS | 13 items listed with section pointers |
| 5 | Scope Boundaries | ✅ PASS | In/Out enumerated; 12 out-of-scope items |
| 6 | File Allowlist | ✅ PASS | 8 files listed |
| 7 | Auth Broker Confinement | ✅ PASS | F-2 gate cited; no @teamhanko imports outside hankoClient.ts |
| 8 | Naming Conventions | ✅ PASS | Full English words; no abbreviations |
| 9 | Module System | ✅ PASS | ESM-only |
| 10 | Data Contracts | N/A | No MatchSetupConfig or zone changes |
| 11 | Error Handling | ✅ PASS | Sign-out try/catch mirrors MyProfilePage |
| 12 | Test Conventions | ✅ PASS | node:test, .test.ts extension |
| 13 | Phase/Turn/Stage | N/A | No engine phase/turn changes |
| 14 | Drift Detection | N/A | No canonical arrays modified |
| 15 | Accessibility | ✅ PASS | Nav uses semantic <nav>, links, buttons |
| 16 | Code Style | ✅ PASS | 00.6 referenced; defineComponent pattern |
| 17 | Vision Alignment | ✅ PASS | §3 Player Trust (discoverable sign-in), §15 Accessibility (nav surface) |
| 18 | Dependencies | ✅ PASS | Hard-deps all ✅ |
| 19 | Contract Files | N/A | No contract files modified |
| 20 | Funding | N/A | No funding surface |
| 21 | API Catalog | N/A | No HTTP endpoints added/modified |

**Result: PASS** (21 items: 14 ✅, 7 N/A, 0 ❌)

---

## Amendments

_(None — initial draft.)_
