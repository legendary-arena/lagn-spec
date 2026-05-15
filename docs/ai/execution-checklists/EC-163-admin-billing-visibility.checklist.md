# EC-163 — Admin Billing Visibility (Execution Checklist)

> **EC slot retarget:** Natural slot EC-110 collides with an existing
> ad-hoc INFRA checklist (Validate Registry CI path fix, Done);
> EC-160 collides with WP-105 (Player Badges, Done 2026-05-15).
> Retargeted to EC-163 (next free slot) per the locked numbering rule
> in EC_INDEX.md.

**Source:** docs/ai/work-packets/WP-110-admin-billing-visibility.md
**Layer:** Server (`apps/server/src/auth/`, `apps/server/src/billing/`) + Client (`apps/arena-client/`)

## Before Starting
- [ ] WP-132 complete (`legendary.entitlements` table + `EntitlementKey`)
- [ ] WP-133 complete (`legendary.stripe_checkout_sessions` table)
- [ ] WP-134 complete (fulfillment processor populates the rows this WP reads)
- [ ] WP-112 complete (session token validation middleware)
- [ ] `legendary.stripe_checkout_sessions` table has columns: `session_id`, `account_id`, `price_id`, `entitlement_key`, `intent_status`, `created_at`, `completed_at`
- [ ] `BillingResult<T>` and `BillingErrorCode` exist in `apps/server/src/billing/billing.types.ts`
- [ ] `'history_lookup_failed'` is already a member of `BillingErrorCode`
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0

## Locked Values (do not re-derive)
- Admin gate header: `X-Admin-Secret`
- Admin gate env var: `ADMIN_SECRET`
- Admin gate function: `requireAdminSecret(request)` returns `{ ok: true } | { ok: false; code: 'unauthorized' }`
- Admin gate comparison: `node:crypto.timingSafeEqual` (not `===`)
- Admin gate fail-closed: missing `ADMIN_SECRET` env var → `{ ok: false }`
- Endpoint: `GET /api/admin/billing/history`
- Response 200: `{ entries: AdminBillingEntry[] }`
- Response 401: `{ code: 'unauthorized' }`
- Response 500: `{ error: 'internal_error' }`
- Cache header: `Cache-Control: no-store` (set before any database access)
- SQL: `SELECT account_id, session_id, entitlement_key, intent_status, created_at, completed_at FROM legendary.stripe_checkout_sessions ORDER BY created_at DESC LIMIT 250`
- Error code reuse: `'history_lookup_failed'` (existing member — no union extension)
- Registration call: `registerAdminBillingRoutes(server.router, pool)`
- Import path: `./billing/adminBilling.routes.js` (`.js` extension — ESM)
- Placement in `server.mjs`: after the existing `registerBillingRoutes(...)` call
- Catalog auth tier: `admin-secret`
- Decisions: D-11001 (shared-secret gate), D-11002 (separate from owner surface)
- `price_id` deliberately excluded from `AdminBillingEntry`
- `AdminBillingEntry` fields: `accountId`, `sessionId`, `entitlementKey`, `intentStatus`, `createdAt`, `completedAt`
- Client test IDs: `admin-billing-loading`, `admin-billing-error`, `admin-billing-empty`, `admin-billing-table`

## Guardrails
- Zero `INSERT`, `UPDATE`, or `DELETE` in `adminBilling.logic.ts` (read-only invariant)
- Zero `stripe` SDK imports in any new file under `billing/`
- Zero modifications to existing billing files: `billing.types.ts`, `billing.routes.ts`, `billingHistory.logic.ts`, `processStripeEvent.logic.ts`
- Zero modifications to `entitlements.types.ts`
- Admin gate is a single file (`adminGate.ts`) — no session, no database, no Stripe SDK
- `requireAdminSecret` never called with user-session auth — admin uses header secret only
- `AdminBillingEntry` is a standalone type — does not extend `BillingHistoryEntry`
- `BillingErrorCode` closed union: do NOT add new members (reuse `'history_lookup_failed'`)
- 01.5 NOT INVOKED — no engine, registry, scoring, or replay surface touched

## Required `// why:` Comments
- `adminGate.ts` — `timingSafeEqual`: explain timing-attack prevention
- `adminGate.ts` — fail-closed: explain why missing `ADMIN_SECRET` returns unauthorized
- `adminBilling.logic.ts` — LIMIT 250: explain unbounded-query prevention
- `adminBilling.logic.ts` — read-only invariant: confirm zero mutation statements by construction
- `adminBilling.routes.ts` — `Cache-Control: no-store`: explain why admin billing data must not be cached
- `server.mjs` call site: cite WP-110, D-11001

## Files to Produce
- `apps/server/src/auth/adminGate.ts` — **new** — shared-secret admin gate
- `apps/server/src/auth/adminGate.test.ts` — **new** — admin gate tests
- `apps/server/src/billing/adminBilling.types.ts` — **new** — `AdminBillingEntry`, `AdminBillingResponse`
- `apps/server/src/billing/adminBilling.logic.ts` — **new** — read-only cross-account query
- `apps/server/src/billing/adminBilling.logic.test.ts` — **new** — logic tests
- `apps/server/src/billing/adminBilling.routes.ts` — **new** — admin billing route + registration
- `apps/server/src/billing/adminBilling.routes.test.ts` — **new** — route tests
- `apps/server/src/server.mjs` — **modified** — import + registration call
- `apps/arena-client/src/lib/api/adminBillingApi.ts` — **new** — client API helper
- `apps/arena-client/src/pages/AdminBillingPage.vue` — **new** — admin billing page
- `apps/arena-client/src/router/` — **modified** — add `/admin/billing` route
- `.env.example` — **modified** — add `ADMIN_SECRET` placeholder
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — append admin endpoint row
- `docs/ai/DECISIONS.md` — **modified** — D-11001, D-11002
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — add WP-110 entry

## After Completing
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0
- [ ] `Select-String` on `adminBilling.logic.ts` for `INSERT|UPDATE|DELETE` — zero matches
- [ ] `Select-String` on `adminBilling.logic.ts` for `stripe` — zero matches
- [ ] `Select-String` on `adminGate.ts` for `timingSafeEqual` — exactly 1 match
- [ ] `Select-String` on `server.mjs` for `registerAdminBillingRoutes` — exactly 2 matches (import + call)
- [ ] `Select-String` on `adminBilling.routes.ts` for `no-store` — exactly 1 match
- [ ] `git diff HEAD -- apps/server/src/billing/billing.types.ts apps/server/src/billing/billing.routes.ts apps/server/src/billing/billingHistory.logic.ts apps/server/src/billing/processStripeEvent.logic.ts` — zero changes
- [ ] `api-endpoints.md` contains `admin-secret` auth tier for the new endpoint
- [ ] D-11001 and D-11002 present in `DECISIONS.md`
- [ ] `WORK_INDEX.md` updated with WP-110
- [ ] 01.5 NOT INVOKED

## Common Failure Smells
- Any `INSERT`/`UPDATE`/`DELETE` match in `adminBilling.logic.ts` → read-only invariant violation
- `stripe` import in any new billing file → Stripe SDK confinement breach
- `===` comparison in `adminGate.ts` instead of `timingSafeEqual` → timing-attack vulnerability
- Missing `ADMIN_SECRET` env var allowing requests through → fail-open bug (must be fail-closed)
- `BillingHistoryEntry` referenced in admin types → cross-surface coupling; use standalone `AdminBillingEntry`
- Import path ending `.ts` instead of `.js` in `server.mjs` → ESM resolution failure at runtime
- Any diff in existing billing files → contract violation; admin surface is additive-only
- `price_id` in `AdminBillingEntry` → deliberate exclusion overridden; needs D-entry if added
