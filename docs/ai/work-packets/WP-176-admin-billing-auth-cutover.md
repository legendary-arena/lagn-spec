# WP-176 — Admin Billing Auth Cutover (requireAdminSecret → requireAdminSession)

**Status:** Drafted 2026-05-24
**Layer:** Server (`apps/server/`)
**EC:** EC-198
**Decisions:** D-17601, D-17602, D-17603 (reserved; landed at execution close)

---

## Goal

Cut over `GET /api/admin/billing/history` from the WP-110 shared-secret
gate (`requireAdminSecret` / `X-Admin-Secret` header) to WP-159's
session-based gate (`requireAdminSession`). The operator (jeff) is the
only admin on production; the cutover is a single commit + redeploy with
no dual-running window.

After execution:
- The route authenticates via Hanko session + `is_admin = TRUE` (per
  WP-159 §A), matching the WP-107 admin profile routes.
- `adminGate.ts` and `adminGate.test.ts` are deleted (no remaining
  callers).
- The `admin-secret` Auth Taxonomy value is removed from
  `api-endpoints.md` (no remaining rows use it).
- The `ADMIN_SECRET` env var on Render is documented as stale (operator
  action to unset post-deploy).

---

## Assumes

- [x] WP-110 — Admin Billing Visibility: shipped, `GET /api/admin/billing/history` is `Wired` in the catalog. D-11001, D-11002.
- [x] WP-159 — Admin Session Gate: shipped 2026-05-17 (`requireAdminSession` in `apps/server/src/auth/adminSession.ts`). D-15901, D-15902.
- [x] WP-107 — Profile Integrity / Anti-Cheat Surface: shipped 2026-05-24. First production caller of `requireAdminSession`. Structural template for the cutover (caller-injected deps, test fixtures, catalog row shape).
- [x] WP-112 — Session Token Validation Middleware: shipped. `requireAuthenticatedSession` orchestrator consumed by `requireAdminSession`.
- [x] WP-131 — Authenticated Routes Production Wiring: shipped. `verifier` + `productionAccountResolver` bindings already in scope at the `server.mjs` registration site.
- [x] WP-126 — External Authentication Integration (Hanko Session Verifier): shipped. Production `createHankoSessionVerifier` wired via WP-131.
- [x] WP-174 — First-Sign-In Auto-Provisioning: shipped 2026-05-24. `productionAccountResolver` is read-or-create; relevant because admin billing queries do NOT need an account row, but the verifier + accountResolver bindings are the same ones threaded through.
- `apps/server/src/auth/adminGate.ts` — sole caller is `adminBilling.routes.ts` (verified via grep).
- `apps/server/src/server.mjs` line 558 — `registerAdminBillingRoutes(server.router, pool)` is the current two-arg call. The `requireAdminSession`, `verifier`, and `accountResolver` bindings are already in scope from lines 572-576 (the `registerAdminProfileRoutes` call).
- `jeff@barefootbetters.com` is the only `is_admin = TRUE` row on production (`legendary.players.ext_id = d3650ed0-afa8-47e1-90d4-401863ee55b5`). Production smoke test of `requireAdminSession` passed 2026-05-24 via `/api/admin/players/nobody/integrity` → 404 with locked body shape.

---

## Context (Read First)

1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md` — §Layer Boundary (Server layer: wires, doesn't decide)
3. `.claude/rules/architecture.md` + `code-style.md` + `work-packets.md`
4. `docs/ai/DECISIONS.md` — D-11001 (admin-secret as temporary), D-11002 (price_id exclusion), D-15901 (admin session composition), D-15902 (single-column auth)
5. `docs/ai/REFERENCE/api-endpoints.md` — Auth Taxonomy section + `/api/admin/billing/history` row
6. `apps/server/src/billing/adminBilling.routes.ts` — the file being cut over
7. `apps/server/src/billing/adminBilling.routes.test.ts` — the test file being rewritten
8. `apps/server/src/auth/adminGate.ts` + `adminGate.test.ts` — the files being deleted
9. `apps/server/src/auth/adminSession.ts` — the gate being adopted (read-only)
10. `apps/server/src/profile/admin/adminProfile.routes.ts` — structural template (caller-injected deps)
11. `apps/server/src/profile/admin/adminProfile.routes.test.ts` — test fixture template (fake `requireAdminSession`)
12. `apps/server/src/server.mjs` — registration site (lines 555-576)

---

## Scope (In)

### §A — Route handler cutover

Rewrite `registerAdminBillingRoutes` in `adminBilling.routes.ts`:

1. **Signature change:** `(router, database)` → `(router, database, deps)` where `deps: AdminBillingRouteDependencies` mirrors `AdminProfileRouteDependencies` (three fields: `requireAdminSession`, `verifier?`, `accountResolver?`).
2. **Import change:** remove `import { requireAdminSecret } from '../auth/adminGate.js'`; add type-only imports for `AdminSessionResult`, `SessionTokenRequest`, `RequireAuthenticatedSessionOptions`, `SessionVerifier`, `AccountResolver` from the same paths WP-107 uses.
3. **Handler rewrite:** replace the `requireAdminSecret(koaContext.req)` call with `deps.requireAdminSession(koaContext.req, { verifier: deps.verifier, accountResolver: deps.accountResolver, database })`. Dispatch on the result's closed-union code:
   - `ok: true` → proceed to `getAdminBillingHistory(database)`
   - `'unauthorized'` → 401 `{ code: 'unauthorized', reason: result.reason }`
   - `'forbidden'` → 403 `{ code: 'forbidden', reason: result.reason }`
   - `'lookup_failed'` → 500 `{ code: 'internal_error' }`
4. **Error body change:** failure responses gain a `reason` field (the old `{ code: 'unauthorized' }` becomes `{ code: <union>, reason: <string> }`). The 500 operational-fault path retains `{ error: 'internal_error' }` (no reason — deliberate; mirrors WP-107).
5. **`Cache-Control: no-store`** remains the first statement (WP-115 D-11504 lock unchanged).
6. **KoaContext type:** `req` type widens from `IncomingMessage` to `SessionTokenRequest` (the `requireAdminSession` signature requires it).

### §B — Test rewrite

Rewrite `adminBilling.routes.test.ts`:

1. Remove `beforeEach` / `afterEach` env-var manipulation (`process.env.ADMIN_SECRET`).
2. Import `AdminSessionResult`, `SessionTokenRequest`, `RequireAuthenticatedSessionOptions` types.
3. Define `makeRequireAdminSession(result)` factory — byte-identical to `adminProfile.routes.test.ts`.
4. Define `okSession`, `unauthorizedSession`, `forbiddenSession` fixtures — same three-fixture pattern.
5. Test cases:
   - 200 happy path with `okSession`
   - 401 with `unauthorizedSession`
   - 403 with `forbiddenSession` (**new test** — the old route had no 403 path)
   - Cache-Control no-store on 200 and 401
   - 500 on database fault with `okSession`
   - Cache-Control no-store on 500
6. No `X-Admin-Secret` header in any fixture.

### §C — Server wiring change

In `apps/server/src/server.mjs`:

1. Replace `registerAdminBillingRoutes(server.router, pool)` with the three-arg form:
   ```js
   registerAdminBillingRoutes(server.router, pool, {
     requireAdminSession,
     verifier,
     accountResolver: verifier === undefined ? undefined : productionAccountResolver,
   });
   ```
2. Update the `// why:` comment from the D-11001 shared-secret rationale to a WP-176 / D-17601 cutover rationale.
3. Remove the now-dead `import { registerAdminBillingRoutes } from './billing/adminBilling.routes.js'` — no, that import stays (the function is still called). Only the call-site args change.

### §D — File deletion

Delete:
- `apps/server/src/auth/adminGate.ts`
- `apps/server/src/auth/adminGate.test.ts`

Post-deletion grep verification: `requireAdminSecret` returns 0 hits under `apps/server/src/`.

### §E — API catalog update (per §21 + D-11804)

In `docs/ai/REFERENCE/api-endpoints.md`:

1. **Replace the `/api/admin/billing/history` row** (whole-row replacement per D-11804). Auth changes from `admin-secret` to `admin-session-required`. Status-code domain expands from `{200, 401, 500}` to `{200, 401, 403, 500}`. Error body changes from `{ code: 'unauthorized' }` to `{ code: <closed-union>, reason: string }`. Notes rewrite the gate description.
2. **Auth Taxonomy reduction:** remove the `admin-secret` row from the Auth Taxonomy table. Update the header from "five values" to "four values". Update the `extended by D-11001 +` reference to cite D-17602 for the removal.
3. **Update the `admin-session-required` taxonomy row:** remove the trailing sentence "No endpoint uses this value today." (WP-107 already uses it; WP-176 adds a second caller).
4. **Changelog entry** at the bottom of `api-endpoints.md`.

### §F — DECISIONS entries

Three entries landed at execution close:

- **D-17601** — Admin billing auth cutover: requireAdminSecret → requireAdminSession.
- **D-17602** — Remove `admin-secret` from Auth Taxonomy closed set (5 → 4 values).
- **D-17603** — Delete `adminGate.ts` + `adminGate.test.ts` (clean cutover, no dormant preservation).

---

## Out of Scope

- **Engine / registry / preplan / client changes** — server-only WP.
- **New admin endpoints** — only WP-110's existing route is in scope.
- **Admin CLI for granting subsequent admins** — separate future WP (noted in WP-159 §Scope Out).
- **Touching production database** — jeff's `is_admin = TRUE` row already exists from PS-1 2026-05-24.
- **Touching Render env vars** — operator action documented as a post-merge step, not a code change.
- **Pre-existing `join-match.test.ts` baseline failure** — carried forward; same disposition as WP-159 / WP-107 / WP-174.
- **`adminBilling.logic.ts`** — query logic unchanged; only the route handler's auth gate changes.
- **`adminBilling.types.ts`** — response types unchanged.
- **`billing.types.ts`** — `DatabaseClient` type unchanged.

---

## Files Expected to Change

1. `apps/server/src/billing/adminBilling.routes.ts` — **modified** (§A: signature change + handler rewrite)
2. `apps/server/src/billing/adminBilling.routes.test.ts` — **modified** (§B: full test rewrite)
3. `apps/server/src/server.mjs` — **modified** (§C: three-arg wiring + comment update)
4. `apps/server/src/auth/adminGate.ts` — **deleted** (§D)
5. `apps/server/src/auth/adminGate.test.ts` — **deleted** (§D)
6. `docs/ai/REFERENCE/api-endpoints.md` — **modified** (§E: row replacement + taxonomy reduction + changelog)
7. `docs/ai/DECISIONS.md` — **modified** (§F: D-17601..D-17603 landed)
8. `docs/ai/work-packets/WORK_INDEX.md` — **modified** (WP-176 checked off)

---

## Non-Negotiable Constraints

### Engine-wide (always apply)

- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Every new or modified file must be written in full — no diffs, no snippets, no "show only the changed section"
- Every function must have a JSDoc comment
- Every `// why:` location documented in EC-198 must be produced verbatim

### Packet-specific

- `adminBilling.logic.ts` is NOT modified — the query layer is untouched
- `adminBilling.types.ts` is NOT modified — the response type contract is untouched
- `adminSession.ts` is NOT modified — the gate is consumed, not changed
- `sessionToken.logic.ts` and `sessionToken.types.ts` are NOT modified
- `auth/hanko/**` is NOT modified
- No new npm dependencies
- No `Math.random()`, no `Date.now()`, no wall-clock reads
- Moves, phases, rules, engine types are not touched (server-only WP)

### Session protocol

- Stop and ask if any file outside the allowlist needs modification
- Stop and ask if any unclear item arises during execution

### Locked contract values

- Route path: `GET /api/admin/billing/history` (unchanged)
- `Cache-Control: no-store` as the first statement of the handler body (D-11504 lock)
- 200 response body: `{ entries: AdminBillingEntry[] }` (unchanged)
- 500 operational-fault body: `{ error: 'internal_error' }` (unchanged)
- Auth failure body shape: `{ code: <closed-union>, reason: string }` where code ∈ `{ 'unauthorized', 'forbidden' }`
- `lookup_failed` maps to 500 `{ code: 'internal_error' }` (not surfaced as a distinct status; mirrors WP-107)
- Status-code domain: `{200, 401, 403, 500}`
- `AdminBillingRouteDependencies` interface: three fields (`requireAdminSession`, `verifier?`, `accountResolver?`)

---

## Acceptance Criteria

1. `pnpm test --filter @legendary-arena/server` passes; test count ≥ baseline (441 pass / 1 fail / 66 skip). The 1-fail is the pre-existing `join-match.test.ts` carry-forward.
2. `pnpm -r build` exits 0.
3. `grep -r 'requireAdminSecret' apps/server/src/` returns 0 hits.
4. `grep -r 'adminGate' apps/server/src/` returns 0 hits (files deleted).
5. `grep -r 'X-Admin-Secret' apps/server/src/` returns 0 hits (no header references remain).
6. `grep -r 'admin-secret' docs/ai/REFERENCE/api-endpoints.md` returns 0 hits (taxonomy value removed).
7. `adminBilling.routes.test.ts` contains no `process.env.ADMIN_SECRET` manipulation.
8. `adminBilling.routes.test.ts` contains a 403 test case (new; the old route had no 403 path).
9. `server.mjs` calls `registerAdminBillingRoutes(server.router, pool, { requireAdminSession, verifier, accountResolver: ... })` — three-arg form.
10. `api-endpoints.md` Auth Taxonomy table has exactly 4 rows (guest, handle-required, authenticated-session-required, admin-session-required).
11. Locked contract files byte-identical pre/post execution: `adminSession.ts`, `adminBilling.logic.ts`, `adminBilling.types.ts`, `billing.types.ts`, `sessionToken.logic.ts`, `sessionToken.types.ts`, `auth/hanko/**`.

---

## Verification Steps

```pwsh
# 1. Build
pnpm -r build
# Expected: exits 0

# 2. Test
pnpm test --filter @legendary-arena/server
# Expected: ≥441 pass, 1 fail (join-match carry-forward), ≥66 skip

# 3. Grep gates
grep -r 'requireAdminSecret' apps/server/src/
# Expected: 0 hits

grep -r 'adminGate' apps/server/src/
# Expected: 0 hits

grep -r 'X-Admin-Secret' apps/server/src/
# Expected: 0 hits

grep -r 'admin-secret' docs/ai/REFERENCE/api-endpoints.md
# Expected: 0 hits

# 4. Locked-file invariant
git diff --name-only apps/server/src/auth/adminSession.ts apps/server/src/billing/adminBilling.logic.ts apps/server/src/billing/adminBilling.types.ts apps/server/src/billing/billing.types.ts apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.types.ts
# Expected: empty (no changes to locked files)

git diff --name-only apps/server/src/auth/hanko/
# Expected: empty
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/DECISIONS.md` updated with D-17601, D-17602, D-17603 (Active)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-176 checked off
- [ ] `docs/ai/REFERENCE/api-endpoints.md` — row replaced + taxonomy reduced
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] 01.5 NOT INVOKED (no engine surface)
- [ ] 01.6 NOT INVOKED (no new code category; pattern mirrors WP-107 precedent)

---

## Vision Alignment

**Vision clauses touched:** §3 (Player Trust), §14 (No Silent Drift), §22 (Auditability).

**Conflict assertion:** No conflict. This WP **improves** vision alignment:
- §3: `requireAdminSession` attributes admin actions to a specific Hanko
  session + `is_admin` row, replacing an anonymous shared secret. Player
  trust improves because admin access is now per-user-auditable.
- §14: The cutover removes the D-11001 "temporary mechanism pending
  future RBAC" tech debt. No silent drift introduced.
- §22: Admin billing queries are now attributable to a specific
  `AccountId`, improving auditability over the shared-secret model.

**Non-Goal proximity check:** None of NG-1..7 are crossed. No
monetization, cosmetics, or paid-surface changes.

---

## Funding Surface Gate

N/A — this WP modifies an existing admin-only backoffice endpoint's
authentication mechanism. No UI surfaces, no user-visible copy, no
funding channels referenced. None of the §20.1 trigger surfaces are
present.

---

## Lint Gate Self-Review

| # | Condition | Verdict |
|---|---|---|
| 1 | Required WP sections present | ✅ |
| 2 | Non-Negotiable Constraints block complete | ✅ |
| 3 | Prerequisites listed | ✅ |
| 4 | Context references specific | ✅ |
| 5 | Files Expected to Change bounded (8 files) | ✅ |
| 6 | Naming consistent with 00.2 + prior packets | ✅ |
| 7 | No forbidden packages | ✅ |
| 8 | Architectural boundaries respected | ✅ |
| 9 | Windows compatibility | ✅ |
| 10 | Env var hygiene | ✅ (ADMIN_SECRET documented as stale post-deploy) |
| 11 | Auth clarity — §11 FIRES | ✅ (explicit: admin-session-required per WP-159) |
| 12 | Test quality | ✅ (node:test only, no network/DB, fake injection) |
| 13 | Verification commands exact | ✅ |
| 14 | Acceptance criteria binary + observable | ✅ (11 items) |
| 15 | Definition of Done complete | ✅ |
| 16 | Code style (§16.1–16.7) | ✅ |
| 17 | Vision Alignment — §17 FIRES | ✅ (§3, §14, §22 cited; no conflict) |
| 18 | Prose-vs-grep discipline | ✅ (no literal-string grep in verification that collides with prose) |
| 19 | Bridge-vs-HEAD staleness | N/A (no bridge artifact) |
| 20 | Funding Surface Gate — §20 N/A | ✅ (admin-only backoffice; no UI, no copy, no funding channels) |
| 21 | API Catalog Update — §21 FIRES | ✅ (row replacement + taxonomy reduction documented in §E) |
| 22–38 | Remaining Final Gate conditions | ✅ / N/A as applicable |

**Result: PASS — all 38 Final Gate conditions satisfied or N/A with justification.**

---

## Post-Merge Operator Action

After the execution PR merges and deploys to Render:

1. Navigate to Render dashboard → `legendary-arena-server` service → Environment.
2. **Delete** the `ADMIN_SECRET` environment variable. It is no longer
   read by any code path. Leaving it set is harmless but stale.
3. Verify the deploy succeeds and `/api/admin/billing/history` returns
   401 for unauthenticated requests (no session) and 200 for jeff's
   session.

---

## Bonus / Opportunistic (for execution session)

A stash exists on jeff's local machine (parked 2026-05-24) with a
`HANKO_JWKS_REFRESH_INTERVAL_MS` parser hardening for `server.mjs`. The
cutover WP modifies `server.mjs` (the `registerAdminBillingRoutes`
wiring call). The execution session is a natural home to pop the stash
and include the hardening in the same EC-scoped commit if convenient.
This is OPTIONAL and must not block the cutover if the stash has
conflicts.
