# WP-110 — Admin Billing Visibility (Read-Only Backoffice Surface)

**Status:** Draft (drafted 2026-05-15; lint-gate self-review pending)
**Primary Layer:** Server (`apps/server/src/billing/**` extension) + Client (`apps/arena-client/src/**`)
**Dependencies:** WP-132 (`legendary.entitlements` table + `EntitlementKey`); WP-133 (`legendary.stripe_checkout_sessions` table + `BillingConfig`); WP-134 (fulfillment processor — the table rows this WP reads are populated by WP-134); WP-112 (session token validation middleware — `requireAuthenticatedSession`).

**Explicit Non-Dependencies:** WP-108 (owner billing UI — separate audience, separate endpoint); WP-152 (profile route wiring — unrelated surface); WP-107 (deferred profile integrity — this WP ships its own minimal admin gate, see §A below).

**Blocked-on note:** No RBAC mechanism exists in the codebase (WP-107 is deferred). This WP introduces a minimal admin gate (shared-secret header check) scoped to the `/api/admin/` prefix. A future RBAC WP may replace this mechanism; the admin gate is isolated in a single file to make that swap trivial.

---

## Goal

After this session, an **admin-only read surface** exists that allows
authorized internal users to:

1. View billing activity across all accounts
2. Inspect checkout session state transitions
3. Correlate Stripe checkout sessions to entitlement fulfillment

This surface is:
- Read-only (zero INSERT / UPDATE / DELETE statements)
- Admin-gated (shared-secret header, not user-session auth)
- Auditable (deterministic ordering, immutable timestamps, closed enum states)
- Independent of the owner-facing billing UI (WP-108)

---

## Justification

### Operational necessity (post-WP-133/134)

The billing pipeline is now live: checkout creation (WP-133), webhook
fulfillment (WP-134), entitlement state (WP-132). But no inspection
surface exists. Without WP-110:
- Cannot debug fulfillment issues
- Cannot verify Stripe webhook correctness
- Cannot audit purchases for dispute resolution

### Separation of concerns

| Surface | Audience | Scope |
|---------|----------|-------|
| WP-108 `GET /api/me/billing/history` | Owner | Personal billing history, scoped to `account_id` |
| WP-110 `GET /api/admin/billing/history` | Admin | Cross-account billing visibility, all rows |

Prevents leaking system metadata (account IDs, cross-account data) to
regular users, and prevents mixing operational and user-facing UI concerns.

---

## Session Context

WP-108 shipped `GET /api/me/billing/history` (owner-scoped, authenticated
via `requireAuthenticatedSession`). That endpoint queries
`legendary.stripe_checkout_sessions WHERE account_id = $1` and returns
`BillingHistoryEntry[]` (4 fields: `entitlementKey`, `intentStatus`,
`createdAt`, `completedAt`).

WP-110 ships a parallel admin surface that queries the same table without
an `account_id` filter, and returns a superset type
(`AdminBillingEntry[]`) that includes `accountId` and `sessionId` for
cross-account correlation. The admin endpoint uses a different auth
mechanism (shared-secret header) and a different URL prefix (`/api/admin/`).

**Scope deliberately excluded from this packet:**
- Refunds, Stripe portal, or any mutation endpoint
- Filtering, search, or CSV export UI (future WP)
- Pagination (LIMIT 250 ceiling documented; future WP if needed)
- RBAC / role-based admin system (future WP replacing the shared-secret gate)

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`.

**Vision clauses touched:** §3 (Player Trust & Fairness), §14 (Explicit
Decisions, No Silent Drift).

**Conflict assertion:** No conflict.

- **§3 Player Trust & Fairness.** The admin surface is read-only and
  gated behind a server-side shared secret. No player-facing data is
  exposed through this surface; the admin sees only what already exists
  in `legendary.stripe_checkout_sessions`. No mutation path is introduced.
- **§14 Explicit Decisions, No Silent Drift.** Two decision points
  surfaced (D-11001, D-11002). The shared-secret admin gate is
  documented as a temporary mechanism pending a future RBAC WP.

**Non-Goal proximity check:** Confirmed clear. NG-1 through NG-7 are
N/A — this WP introduces no gameplay, monetization, or entitlement
mutation surface.

**Determinism preservation:** N/A. WP-110 touches no engine, registry,
scoring, replay, RNG, or simulation surface.

---

## Funding Surface Gate (§20)

**§20 N/A.** WP-110 introduces a backend admin inspection surface with
no user-visible funding, donation, or attribution UI. None of the §20.1
trigger surfaces are touched.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

WP-110 adds one new endpoint. §21 fires.

**Required catalog update:**

1. **Append one new row** for `GET /api/admin/billing/history`:
   - `Status`: `Wired`
   - `Method`: `GET`
   - `Path`: `/api/admin/billing/history`
   - `Auth`: `admin-secret` (new auth tier — see D-11001)
   - `Request Schema`: none (GET, no body)
   - `Response Schema`: 200 with `{ entries: AdminBillingEntry[] }`;
     401 with `{ code: 'unauthorized' }`;
     500 with `{ error: 'internal_error' }`
   - `Authorizing WP`: `WP-110`
   - `Notes`: read-only; shared-secret gate; LIMIT 250

---

## Assumes

- WP-132 / WP-133 / WP-134 / WP-112 complete.
- `legendary.stripe_checkout_sessions` exists with columns: `id`,
  `session_id`, `account_id`, `price_id`, `entitlement_key`,
  `intent_status`, `created_at`, `completed_at` (per migration 012).
- `apps/server/src/billing/billing.types.ts` exports `BillingResult<T>`,
  `BillingErrorCode`, `DatabaseClient`.
- `pnpm --filter @legendary-arena/server build` exits 0.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary (server layer responsibilities)
- `docs/ai/REFERENCE/api-endpoints.md` (existing catalog)
- `docs/ai/DECISIONS.md` (scan for billing-area decisions: D-13301..D-13309, D-10801, D-10802)
- `apps/server/src/billing/billing.types.ts` (existing `BillingErrorCode` closed union)
- `apps/server/src/billing/billingHistory.logic.ts` (WP-108 pattern to mirror)
- `data/migrations/012_create_stripe_events_and_checkout_sessions.sql` (table schema)

---

## Non-Negotiable Constraints

### Engine-wide
- ESM only
- Node v22+
- No Stripe SDK calls in read APIs
- No mutation (read-only SQL only)

### Packet-specific
- Admin gate via shared-secret header (`X-Admin-Secret`), not session auth
- No checkout, refund, or mutation endpoints
- No Stripe secret key or PII exposure
- `Cache-Control: no-store` on all admin responses
- `intentStatus` domain is closed: `'open' | 'completed' | 'expired' | 'canceled'`
- Must not modify:
  - `processStripeEvent.logic.ts`
  - `entitlements.types.ts`
  - `billingHistory.logic.ts`
  - Existing billing routes or types

### Deliberate exclusions
- `price_id` is excluded from `AdminBillingEntry` — the admin surface
  correlates via `entitlementKey` (the server-resolved value) and
  `sessionId` (for Stripe dashboard lookup). Raw Stripe price IDs are
  operational detail that belong in the Stripe dashboard, not the admin
  surface. If dispute resolution requires `price_id`, it can be added
  in a follow-up WP with a DECISIONS.md entry.

---

## Scope (In)

### A) Admin Auth Gate (Server) — NEW

**File:** `apps/server/src/auth/adminGate.ts` — **new**

Introduces a minimal admin authentication middleware:

```ts
export function requireAdminSecret(
  request: IncomingMessage,
): { ok: true } | { ok: false; code: 'unauthorized' } {
  // Reads ADMIN_SECRET from process.env at call time
  // Compares X-Admin-Secret header via timing-safe comparison
  // Returns ok: false if ADMIN_SECRET env var is not set (fail-closed)
}
```

- Uses `node:crypto.timingSafeEqual` to prevent timing attacks
- Fail-closed: if `ADMIN_SECRET` is not configured, all admin requests return 401
- Single file, single function — easy to replace with RBAC later
- No session, no database, no Stripe SDK

**Env var:** `ADMIN_SECRET` — added to `.env.example` with a placeholder value and a comment noting it gates `/api/admin/*` routes.

### B) Admin Billing Types (Server)

**File:** `apps/server/src/billing/adminBilling.types.ts` — **new**

```ts
export interface AdminBillingEntry {
  readonly accountId: string;
  readonly sessionId: string;
  readonly entitlementKey: string;
  readonly intentStatus: 'open' | 'completed' | 'expired' | 'canceled';
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface AdminBillingResponse {
  readonly entries: readonly AdminBillingEntry[];
}
```

Note: `AdminBillingEntry` is a superset of `BillingHistoryEntry` (adds
`accountId` and `sessionId`). It is declared as a separate type — not
extending `BillingHistoryEntry` — to maintain clean separation between
owner and admin surfaces.

### C) Admin Billing Logic (Read Helper)

**File:** `apps/server/src/billing/adminBilling.logic.ts` — **new**

Export:
```ts
export async function getAdminBillingHistory(
  database: DatabaseClient,
): Promise<BillingResult<AdminBillingEntry[]>>
```

Query:
```sql
SELECT account_id, session_id, entitlement_key,
       intent_status, created_at, completed_at
FROM legendary.stripe_checkout_sessions
ORDER BY created_at DESC
LIMIT 250
```

Constraints:
- Read-only (zero INSERT / UPDATE / DELETE)
- No Stripe SDK calls
- No `accountId` filter (cross-account by design)
- Deterministic ordering (`ORDER BY created_at DESC`)
- Fixed LIMIT 250 (prevents runaway queries)
- Uses existing `BillingResult<T>` from `billing.types.ts`
- Reuses `'history_lookup_failed'` error code (already in `BillingErrorCode` closed union via WP-108)

### D) Admin Billing Route

**File:** `apps/server/src/billing/adminBilling.routes.ts` — **new**

Expose: `GET /api/admin/billing/history`

Registration export:
```ts
export function registerAdminBillingRoutes(
  router: Router,
  database: DatabaseClient,
): void
```

Behavior:
| Status | Response |
|--------|----------|
| 200 | `{ entries: AdminBillingEntry[] }` |
| 401 | `{ code: 'unauthorized' }` |
| 500 | `{ error: 'internal_error' }` |

Requirements:
- Must call `requireAdminSecret(request)` before any database access
- Must set `Cache-Control: no-store` as first response header
- Must NOT expose Stripe IDs beyond `sessionId`
- Must NOT expose email addresses or PII

### E) Route Registration

**File:** `apps/server/src/server.mjs` — **modified**

Add:
```js
import { registerAdminBillingRoutes } from './billing/adminBilling.routes.js';
```

Then:
```js
registerAdminBillingRoutes(server.router, pool);
```

Placement: after the existing billing route block (`registerBillingRoutes`).

### F) Client Admin API

**File:** `apps/arena-client/src/lib/api/adminBillingApi.ts` — **new**

```ts
export async function fetchAdminBillingHistory(adminSecret: string)
```

Requirements:
- Sends `X-Admin-Secret` header (not `Authorization: Bearer`)
- Maps status: 401 -> unauthorized, 500 -> fault
- Returns typed `AdminBillingEntry[]` on success

### G) Admin Billing Page

**File:** `apps/arena-client/src/pages/AdminBillingPage.vue` — **new**

Displays a table:
| Account | Session | Entitlement | Status | Created | Completed |
|---------|---------|-------------|--------|---------|-----------|

States:
- `loading` — spinner while fetching
- `error` — error message
- `empty` — "No billing records found"
- `ready` — table with data

Required test IDs:
- `admin-billing-loading`
- `admin-billing-error`
- `admin-billing-empty`
- `admin-billing-table`

### H) Admin Route (Client)

**File:** router config — **modified**

Path: `/admin/billing`

Requirements:
- Must not render without a valid admin secret (prompt or local storage)
- No server-side session required — the admin secret is the auth mechanism

### I) API Catalog

**File:** `docs/ai/REFERENCE/api-endpoints.md` — **modified**

Append one row per D-11804 replace-whole-row semantics:

| Method | Path | Auth | Status | Authorizing WP |
|--------|------|------|--------|----------------|
| GET | `/api/admin/billing/history` | `admin-secret` | Wired | WP-110 |

### J) Tests

#### Logic tests
**File:** `apps/server/src/billing/adminBilling.logic.test.ts` — **new**
- Empty result returns `{ ok: true, value: [] }`
- Populated result returns correctly shaped entries
- DB failure returns `{ ok: false, code: 'history_lookup_failed' }`

#### Route tests
**File:** `apps/server/src/billing/adminBilling.routes.test.ts` — **new**
- 200 success with valid admin secret
- 401 missing or invalid admin secret
- `Cache-Control: no-store` header present on all responses

#### Admin gate tests
**File:** `apps/server/src/auth/adminGate.test.ts` — **new**
- Valid secret returns `{ ok: true }`
- Invalid secret returns `{ ok: false, code: 'unauthorized' }`
- Missing `ADMIN_SECRET` env var returns `{ ok: false, code: 'unauthorized' }` (fail-closed)
- Timing-safe comparison (no early exit on partial match)

---

## Out of Scope

- Refunds or any Stripe mutation
- Stripe portal or customer management
- User editing or account management
- Filtering / search UI (future WP)
- CSV / data export (future WP)
- Pagination beyond LIMIT 250 (future WP if needed)
- Full RBAC / role system (future WP replacing `adminGate.ts`)
- `price_id` in response (see §Non-Negotiable Constraints, Deliberate exclusions)

---

## Files Expected to Change

- `apps/server/src/auth/adminGate.ts` — new — shared-secret admin gate
- `apps/server/src/auth/adminGate.test.ts` — new — admin gate tests
- `apps/server/src/billing/adminBilling.types.ts` — new — admin billing entry types
- `apps/server/src/billing/adminBilling.logic.ts` — new — read-only query helper
- `apps/server/src/billing/adminBilling.logic.test.ts` — new — logic tests
- `apps/server/src/billing/adminBilling.routes.ts` — new — admin billing route
- `apps/server/src/billing/adminBilling.routes.test.ts` — new — route tests
- `apps/server/src/server.mjs` — modified — wire admin billing routes
- `apps/arena-client/src/lib/api/adminBillingApi.ts` — new — client API helper
- `apps/arena-client/src/pages/AdminBillingPage.vue` — new — admin billing page
- `apps/arena-client/src/router/` — modified — add `/admin/billing` route
- `docs/ai/REFERENCE/api-endpoints.md` — modified — catalog row
- `docs/ai/STATUS.md` — modified — progress update
- `docs/ai/DECISIONS.md` — modified — D-11001, D-11002
- `docs/ai/work-packets/WORK_INDEX.md` — modified — add WP-110 entry
- `.env.example` — modified — add `ADMIN_SECRET` placeholder

---

## Contract

> **Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - ESM only, Node v22+
> - Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
> - Read-only: zero INSERT / UPDATE / DELETE in any new file
> - No Stripe SDK imports in any new file
> - No modification of existing billing types or logic files

---

## Acceptance Criteria

- [ ] `GET /api/admin/billing/history` returns `{ entries: AdminBillingEntry[] }` with 200
- [ ] Request without `X-Admin-Secret` header returns 401
- [ ] Request with wrong `X-Admin-Secret` value returns 401
- [ ] Missing `ADMIN_SECRET` env var causes all admin requests to return 401 (fail-closed)
- [ ] `Cache-Control: no-store` header present on all admin responses
- [ ] `adminBilling.logic.ts` contains zero `INSERT`, `UPDATE`, or `DELETE` statements (grep verification)
- [ ] `adminBilling.logic.ts` contains zero `stripe` SDK imports (grep verification)
- [ ] `AdminBillingPage.vue` renders table with all four states (loading, error, empty, ready)
- [ ] All test files pass: `pnpm test`
- [ ] `api-endpoints.md` contains the new `GET /api/admin/billing/history` row
- [ ] No existing billing files modified (billingHistory.logic.ts, billing.types.ts, billing.routes.ts, processStripeEvent.logic.ts)

---

## Verification Steps

```pwsh
# No Stripe SDK in admin billing logic
Select-String -Path "apps\server\src\billing\adminBilling.logic.ts" -Pattern "stripe"
# Expected: no matches

# Read-only verification
Select-String -Path "apps\server\src\billing\adminBilling.logic.ts" -Pattern "INSERT|UPDATE|DELETE"
# Expected: no matches

# Admin gate uses timing-safe comparison
Select-String -Path "apps\server\src\auth\adminGate.ts" -Pattern "timingSafeEqual"
# Expected: 1 match

# Route wired in server.mjs
Select-String -Path "apps\server\src\server.mjs" -Pattern "registerAdminBillingRoutes"
# Expected: 2 matches (import + call)

# Cache-Control header set
Select-String -Path "apps\server\src\billing\adminBilling.routes.ts" -Pattern "no-store"
# Expected: 1 match

# No existing billing files modified
git diff --name-only -- apps/server/src/billing/billing.types.ts apps/server/src/billing/billing.routes.ts apps/server/src/billing/billingHistory.logic.ts apps/server/src/billing/processStripeEvent.logic.ts
# Expected: no output

# All tests pass
pnpm test
```

---

## Decisions

- **D-11001** — Admin billing visibility uses a shared-secret header gate (`X-Admin-Secret` + `ADMIN_SECRET` env var) rather than session-based RBAC. Rationale: no RBAC infrastructure exists (WP-107 deferred); the shared-secret pattern is the minimum viable admin gate that is (a) trivial to replace when RBAC ships, (b) fail-closed when unconfigured, (c) timing-safe against brute-force. The gate is isolated in `apps/server/src/auth/adminGate.ts` (single file, single function) so a future RBAC WP can swap the implementation without touching route files. Auth taxonomy in `api-endpoints.md` uses `admin-secret` (new tier) to distinguish from `guest` / `handle-required` / `authenticated-session-required`.
- **D-11002** — Admin billing surface (`GET /api/admin/billing/history`) does not reuse the owner billing endpoint (`GET /api/me/billing/history`) to maintain separation of concerns. The admin type (`AdminBillingEntry`) is a superset of the owner type (`BillingHistoryEntry`), adding `accountId` and `sessionId`. The types are declared independently (no `extends`) so that changes to the owner surface do not ripple into the admin surface. `price_id` is deliberately excluded from the admin response — Stripe dashboard lookup via `sessionId` is sufficient for dispute correlation.

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-11001, D-11002
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has this packet listed
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated with new row
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 NOT INVOKED (no engine, registry, scoring, or replay surface touched)

---

## Lint Self-Review

Pending — to be completed before execution.
