# WP-159 — Admin Session Gate (Session-Based Admin Authentication)

**Status:** Draft (drafted 2026-05-17; lint-gate self-review pending)
**Primary Layer:** Server (`apps/server/src/auth/**`, `apps/server/src/identity/**`) + Database (`data/migrations/014_*`)
**Dependencies:**
- WP-052 (`legendary.players` table; `AccountId` brand; `Result<T>` shape)
- WP-101 (`handle` column on `legendary.players`; migration-slot precedent for additive ALTER)
- WP-112 (`requireAuthenticatedSession` orchestrator; `SessionVerifier` interface; caller-injected `accountResolver` pattern)
- WP-126 (Hanko verifier — the broker-specific implementation injected at startup)
- WP-131 (`configureSessionValidation` production wiring at server startup)

**Explicit Non-Dependencies:** WP-110 (the existing shared-secret admin gate is left intact; this WP introduces a parallel session-based gate. Cutover of WP-110's `/api/admin/billing/history` route to the new gate is OUT OF SCOPE — handled in a follow-up swap WP). WP-107 (profile integrity surface — first caller of this gate, but ships in its own session under its own EC).

**Unblocks:** WP-107 (profile integrity / anti-cheat surface), and any future admin-only route that requires per-user attribution.

---

## Goal

After this session, an **admin-session authentication primitive** exists that gates
`/api/admin/*` routes by composing:

1. The WP-112 session-token orchestrator (`requireAuthenticatedSession`), which
   validates a Hanko-issued bearer token via the WP-126 verifier and resolves the
   token to an `AccountId`.
2. A new boolean column `is_admin` on `legendary.players` (migration 014).
3. A new helper `requireAdminSession(request, options)` that returns:
   - `{ ok: true; accountId }` when the session is valid AND `is_admin = true`,
   - `{ ok: false; code: 'unauthorized' }` when no valid session,
   - `{ ok: false; code: 'forbidden' }` when valid session but `is_admin = false`,
   - `{ ok: false; code: 'lookup_failed' }` when the DB read fails.

The primitive is **isolated in a single file** (`apps/server/src/auth/adminSession.ts`)
so the broker can later evolve to roles/permissions without rippling through
caller routes. WP-110's shared-secret gate (`adminGate.ts`) remains in place as a
deprecated fallback until a follow-up swap WP migrates its callers.

The result is a session-based admin authentication seam that WP-107 (and any future
admin-only surface) can adopt with a single import.

---

## Justification

### Operational necessity (post-WP-110)

WP-110 shipped `apps/server/src/auth/adminGate.ts` (shared-secret header check)
as the minimum viable admin gate, with D-11001 explicitly recording the choice
as **temporary, pending future RBAC**. The shared-secret pattern:

- Has no per-user attribution (every admin action is anonymous from the server's perspective)
- Cannot be audited per-administrator
- Cannot scale to "moderator" / "support" / multi-tier admin needs
- Conflates "is the request from someone authorized" with "which person made the request"

WP-107 explicitly requires admin actions attributable to a specific account (so
profile integrity actions — suspend / unsuspend — can be recorded in an audit
log with the acting admin's `accountId`). The shared-secret gate cannot satisfy
this; WP-107 is therefore blocked.

### Why not a full role/permission system?

A granular role/permission system (roles table, permissions table, role-permission
join, `requireRole()` / `requirePermission()` middleware, audit log of role
changes) is out of scope for this WP for three reasons:

1. **No concrete caller needs it yet.** WP-107 needs `admin vs not-admin`; it does
   not need to distinguish `admin` from `moderator` or `billing-admin` from
   `support-admin`. Building the discrimination before a caller exists is
   speculative.
2. **Lint-gate blast radius.** A full role system touches ~15+ files and introduces
   multiple new contract surfaces (Role union, Permission union, audit log table,
   bootstrap-first-admin flow). Each contract surface multiplies the §17 vision
   alignment + §21 catalog update obligations. Smaller WPs ship faster and
   regress less.
3. **Forward-compatible seam.** The single-column `is_admin` shape can later be
   replaced by a join against a `legendary.player_roles` table without touching
   the `requireAdminSession` callers — the function's return shape
   (`{ ok: true; accountId }`) is identical whether authorization is decided by a
   boolean column or a role lookup. The cost of the migration is real but bounded
   to one file.

D-15901 records the gate-composition choice; D-15902 records the single-column
authorization choice with explicit forward-compatibility notes.

### Separation from WP-110

| Surface | Auth | Caller | Status |
|---------|------|--------|--------|
| WP-110 `GET /api/admin/billing/history` | `admin-secret` (shared-secret header) | manual SRE | Live; deprecated by D-11001 |
| WP-159 `requireAdminSession(req, opts)` | `admin-session-required` (Hanko session + `is_admin`) | future admin routes (WP-107 first) | New seam, this WP |

This WP does **not** cut over WP-110. The existing route remains on the shared-secret
gate; cutover is a deliberately separate follow-up WP so the swap can be reviewed,
verified, and rolled back independently of the gate's introduction.

---

## Session Context

WP-112 ships the broker-agnostic orchestrator `requireAuthenticatedSession(req, options)`
returning `Promise<Result<AccountId>>`. The orchestrator's failure codes (per
`SessionValidationErrorCode` in
[apps/server/src/auth/sessionToken.types.ts](apps/server/src/auth/sessionToken.types.ts))
are: `missing_token`, `invalid_token`, `expired_token`, `unknown_account`,
`session_verifier_not_configured`, `lookup_failed`.

WP-126 ships the Hanko-specific `SessionVerifier` implementation under
`apps/server/src/auth/hanko/`. WP-131 wires `configureSessionValidation({ verifier,
accountResolver, database })` at server startup so production routes can call
`requireAuthenticatedSession` with the production seams bound.

`legendary.players` (per migration 004 + amendments through 013) has columns:
`player_id`, `ext_id`, `email`, `display_name`, `handle`, `auth_provider`,
`auth_provider_id`, `avatar_url`, `created_at`, `updated_at`. No
admin-related column exists. Migration 014 adds `is_admin BOOLEAN NOT NULL DEFAULT FALSE`.

**Scope deliberately excluded from this packet** (each may motivate a future WP):
- Roles or permissions beyond `is_admin` boolean
- Audit log of admin actions
- Admin-only CLI to grant/revoke `is_admin`
- Bootstrap-first-admin flow (operator sets `is_admin = TRUE` directly via SQL for
  the initial admin; subsequent grants come from a future admin-CLI WP)
- Cutover of WP-110's existing routes from `requireAdminSecret` to
  `requireAdminSession`
- Cookie-carried session tokens (WP-112 D-11202 bearer-header lock unchanged)

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`.

**Vision clauses touched:** §3 (Player Trust & Fairness), §14 (Explicit Decisions, No Silent Drift), §22 (Auditability of authoritative actions).

**Conflict assertion:** No conflict.

- **§3 Player Trust & Fairness.** The gate is server-side only. No player-facing
  surface changes. The admin-attribution capability this gate enables is a
  prerequisite for trustworthy moderation actions (WP-107); without per-admin
  attribution, fairness review of admin actions is impossible.
- **§14 Explicit Decisions, No Silent Drift.** Two decision points (D-15901,
  D-15902) record the gate-composition choice and the single-column
  authorization shape. The forward-compatibility path to a role/permission system
  is explicitly documented; future migration to a `player_roles` join is a
  contract-preserving change.
- **§22 Auditability.** The gate produces an `accountId` on success, which makes
  every admin action attributable. The shared-secret gate (WP-110) cannot satisfy
  §22 for admin-mutation surfaces. This WP does not itself add an audit log
  (deferred), but it provides the prerequisite identity needed for one.

**Non-Goal proximity check:** Confirmed clear. NG-1 through NG-7 are N/A — this WP
introduces no gameplay, monetization, or entitlement mutation surface.

**Determinism preservation:** N/A. WP-159 touches no engine, registry, scoring,
replay, RNG, or simulation surface.

---

## Funding Surface Gate (§20)

**§20 N/A.** WP-159 introduces a backend authentication primitive with no
user-visible funding, donation, or attribution UI. None of the §20.1 trigger
surfaces are touched.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

WP-159 adds zero HTTP endpoints (it is a library-only authentication primitive).
However, the **Auth taxonomy** in `docs/ai/REFERENCE/api-endpoints.md` gains a
new closed-set value: `admin-session-required`. §21 fires for the taxonomy update.

**Required catalog update:**

1. **Auth taxonomy block** in `api-endpoints.md` — add the new value
   `admin-session-required` to the closed `Auth` set (alongside existing
   `guest`, `handle-required`, `authenticated-session-required`, `admin-secret`),
   with a one-line definition: *"Server-validated Hanko session + `is_admin = TRUE`
   on the resolved `legendary.players` row. See WP-159 §A."*
2. **Library-only entry** for `requireAdminSession` itself, added to the
   `Library-only` block (the same block that catalogs `requireAuthenticatedSession`):
   - `Status`: `Library-only`
   - `Method`: N/A
   - `Path`: N/A
   - `Surface`: `apps/server/src/auth/adminSession.ts → requireAdminSession()`
   - `Auth`: `admin-session-required`
   - `Authorizing WP`: WP-159
   - `Notes`: composes `requireAuthenticatedSession` + `is_admin` DB read; first caller is WP-107.

No live HTTP endpoint changes status.

---

## Assumes

- WP-052 / WP-101 / WP-112 / WP-126 / WP-131 complete.
- `legendary.players` exists with the columns enumerated in §Session Context
  (per migrations 004 + 008 + 009 + 013).
- `apps/server/src/auth/sessionToken.logic.ts` exports
  `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>` with the
  signature locked in WP-112 §A and the error codes enumerated in
  `SessionValidationErrorCode`.
- `apps/server/src/identity/identity.types.ts` exports `AccountId`, `Result<T>`,
  and `DatabaseClient` per WP-052 D-5201.
- `pnpm --filter @legendary-arena/server build` exits 0.
- The migration runner under `apps/server/scripts/run-migrations.mjs` (or its
  successor) can apply migration 014 against a development PostgreSQL instance.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary (server-layer responsibilities;
  authorization is server-only)
- `docs/ai/REFERENCE/00.2-data-requirements.md` §1 (players entity field names)
  and §Authentication (auth_provider semantics)
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` §11 (Authentication Clarity),
  §17 (Vision Alignment), §21 (API Catalog Update Obligation)
- `docs/ai/REFERENCE/api-endpoints.md` (existing Auth taxonomy closed set; the
  taxonomy block this WP extends)
- `docs/ai/DECISIONS.md` — scan D-5201, D-9901..D-9905, D-11001, D-11002,
  D-11201..D-11204, D-11804, D-12601..D-12604 (identity + auth + admin gate
  history)
- `apps/server/src/auth/adminGate.ts` (existing WP-110 shared-secret gate — the
  pattern this WP mirrors at the file-isolation level)
- `apps/server/src/auth/sessionToken.types.ts` and `sessionToken.logic.ts`
  (WP-112 orchestrator — the upstream this WP composes)
- `apps/server/src/identity/identity.types.ts` (`Result<T>`, `AccountId`,
  `DatabaseClient`)
- `data/migrations/004_create_players_table.sql` (table being extended)
- `data/migrations/008_add_handle_to_players.sql` (additive-ALTER precedent for
  migration 014's shape)

---

## Non-Negotiable Constraints

### Engine-wide
- Full file contents for every new or modified file (no diffs, no snippets)
- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- No `axios` or `node-fetch` — built-in `fetch` only (no HTTP calls expected in this WP)
- All commands use `pnpm` — never `npm run`

### Packet-specific
- The new file `apps/server/src/auth/adminSession.ts` MUST be the **single source**
  of admin-session authorization logic. No caller may re-implement the
  `is_admin` check inline.
- **No caller (in this or any future WP) may issue a `SELECT ... is_admin`
  query directly against `legendary.players`.** All admin authorization MUST
  go through `requireAdminSession`. This is the load-bearing seam for the
  later forward-compat migration to a `player_roles` join; an inline read
  silently breaks the migration.
- **Fail-closed at the admin layer.** Any unexpected condition — including
  malformed DB responses, missing fields, non-boolean `is_admin` values,
  truthy-but-not-`true` JS coercions, or any code path not explicitly
  enumerated in §A — MUST resolve to a failure result. `{ ok: true; ... }`
  is reachable ONLY when both (a) `requireAuthenticatedSession` returned
  success AND (b) the DB read returned exactly one row with `is_admin === true`
  (strict triple-equals, not truthy coercion).
- **No caching.** The helper MUST NOT cache `is_admin` values, account
  lookups, or any intermediate result across invocations. Every call performs
  a fresh DB read. (Future optimization could add a request-scoped cache; it
  is OUT OF SCOPE here and would be its own WP with its own invalidation
  contract.)
- **No partial-success / mixed result.** Every call returns exactly one
  `AdminSessionResult` object. No path may return `undefined`, throw, mutate
  callers' state, or emit a result with both `ok: true` and a `code` field.
- **`reason` envelope (deterministic):**
  - MUST be a stable, human-readable, single-sentence string.
  - MUST NOT include dynamic values (timestamps, account IDs, query
    parameters, header values, or any per-request data).
  - MUST NOT expose internal error codes, SQL fragments, or stack traces.
  - All `'unauthorized'` returns MUST share the canonical prefix
    `"Admin session validation failed: "` followed by the static suffix
    appropriate to the upstream failure category. The exact suffix strings
    are enumerated in §A.
  - All `'forbidden'` returns MUST use the exact string
    `"Authenticated account does not have admin privileges."`.
  - All `'lookup_failed'` returns MUST use one of exactly **three** static
    sentences, one per cause: (1) zero-row, (2) DB-throw, (3) multi-row.
    Enumerated verbatim in §A.
- `requireAdminSession` MUST compose `requireAuthenticatedSession` (no duplicate
  token-extraction or verifier-call logic). Composing the orchestrator preserves
  WP-112's D-11202 (bearer-header only) and D-11204 (fail-closed default) by
  construction.
- The DB read MUST use a parameterized query (`SELECT is_admin FROM
  legendary.players WHERE ext_id = $1`). No string-concatenated SQL.
- **SQL shape (locked):** single-table SELECT against `legendary.players`. No
  `JOIN`, no `LIMIT`, no `OFFSET`, no `ORDER BY`, no column aliasing
  (`AS` rename), no `RETURNING` clause. Exactly one column selected
  (`is_admin`); exactly one `WHERE` predicate (`ext_id = $1`). The returned
  row's column MUST be accessed as `row.is_admin` (the unaliased column
  name).
- **Row schema validation:** the single returned DB row MUST contain a field
  named `is_admin`. If the field is missing (`undefined`), `null`, or not
  strictly boolean (per `typeof row.is_admin === 'boolean'`), the function
  MUST return `{ ok: false; code: 'lookup_failed' }` with the canonical
  DB-throw reason sentence. This defends against malformed fake
  `DatabaseClient` rows in tests and any future column-rename drift.
- The DB read MUST resolve via the same `DatabaseClient` shape passed through
  `RequireAuthenticatedSessionOptions.database` — no separate pool, no separate
  connection. The query MUST be executed through `options.database.query(...)`
  (the standardized call surface on the WP-052 `DatabaseClient` interface). No
  direct `pg.Pool`, no `pool.connect()` + manual release, no alternate driver.
- **No mutation of input arguments.** `requireAdminSession` MUST NOT mutate
  `request`, `options`, `options.verifier`, `options.accountResolver`, or
  `options.database`. All inputs are treated as immutable.
- **No parallelism, no batching.** The DB read MUST NOT be parallelized with
  another query, batched, pipelined, or composed with `Promise.all`.
  Authorization is evaluated in isolation per invocation — one sequential
  round trip per call.
- **No fallback path.** The helper MUST NOT fall back to any alternative
  authorization mechanism (shared-secret header, IP allowlist, environment-flag
  bypass, dev-mode escape hatch). The only valid success path is the §A step-6
  branch.
- The function MUST return `{ ok: false; code: 'lookup_failed' }` on DB error —
  it MUST NOT throw, and MUST NOT surface the underlying DB error message
  verbatim to the caller (operational fault opacity per the WP-052 / WP-112
  precedent).
- Migration 014 MUST be **purely additive** (`ALTER TABLE ... ADD COLUMN is_admin
  BOOLEAN NOT NULL DEFAULT FALSE`). No existing rows change behavior; all
  pre-existing rows default to `is_admin = FALSE`.
- Migration 014 MUST be idempotent (`ADD COLUMN IF NOT EXISTS` per PostgreSQL
  syntax, or guarded with a `DO $$ BEGIN ... EXCEPTION WHEN duplicate_column ...`
  block — see migration 008 for the project's idempotency precedent).
- Migration 014 MUST include a `COMMENT ON COLUMN legendary.players.is_admin`
  statement documenting the WP authority and the operator-granted semantics
  (see §C for exact text).
- The new closed-union error code `AdminSessionErrorCode` MUST be paired with a
  canonical readonly array `ADMIN_SESSION_ERROR_CODES` per
  `00.6-code-style.md §"Drift Detection"`. The drift test MUST use **bidirectional
  Set equality** (every union member appears in the array AND the array
  contains no extra values) — not a one-sided membership check.
- Must NOT modify:
  - `apps/server/src/auth/adminGate.ts` (WP-110's shared-secret gate; cutover is a follow-up WP)
  - `apps/server/src/auth/sessionToken.logic.ts` (WP-112 orchestrator is locked)
  - `apps/server/src/auth/sessionToken.types.ts` (WP-112 contract is locked)
  - `apps/server/src/auth/hanko/**` (WP-126 verifier is locked)
  - `apps/server/src/identity/identity.types.ts` (WP-052 contract is locked)
  - Any WP-110 route file (`apps/server/src/billing/adminBilling.*`)
  - Any WP-107 file (does not exist yet at execution time)

### Session protocol
- If during execution Claude finds that any of the above "Must NOT modify" files
  needs to change, STOP and surface the issue — do not edit it. This is the
  primary indicator that the WP's scope is wrong; the right response is to
  raise the conflict, not to widen the patch.
- If the migration cannot be applied to a development database (e.g., FP-03
  seed runner still blocked), STOP and report — do not synthesize a substitute
  runner.

### Locked contract values
- New file path: `apps/server/src/auth/adminSession.ts` (single-file isolation,
  mirrors `adminGate.ts` precedent)
- Function signature:
  ```ts
  export async function requireAdminSession(
    request: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ): Promise<AdminSessionResult>
  ```
- Result shape:
  ```ts
  export type AdminSessionResult =
    | { readonly ok: true; readonly accountId: AccountId }
    | { readonly ok: false; readonly code: AdminSessionErrorCode; readonly reason: string };
  ```
- Closed union:
  ```ts
  export type AdminSessionErrorCode =
    | 'unauthorized'      // upstream requireAuthenticatedSession failed
    | 'forbidden'         // session valid but is_admin = false
    | 'lookup_failed';    // DB read failure (incl. zero rows or multi-row)
  ```
- **Identity mapping (invariant for this WP):** `AccountId` MUST correspond
  exactly to `legendary.players.ext_id`. This mapping is the WP-052 D-5201
  contract; WP-159 binds `accountId` directly to `$1` in
  `SELECT is_admin FROM legendary.players WHERE ext_id = $1`. If a future
  identity refactor changes the resolution column (e.g., to `player_id`),
  WP-159 is **INVALIDATED** and must be revised before execution.
- **Import sources (locked):**
  - `SessionTokenRequest` MUST be imported from
    `apps/server/src/auth/sessionToken.types.ts` — no local redeclaration,
    no aliasing through a different module.
  - `RequireAuthenticatedSessionOptions` MUST be imported from
    `apps/server/src/auth/sessionToken.types.ts` — exact casing preserved,
    no shortening to `SessionOptions` or any other alias.
  - `requireAuthenticatedSession` MUST be imported from
    `apps/server/src/auth/sessionToken.logic.ts` — no re-export shim, no
    barrel file.
  - `AccountId`, `Result`, `DatabaseClient` are imported via the re-export
    block at the bottom of `sessionToken.types.ts` (per WP-112 lines
    244–249) — never re-imported directly from
    `apps/server/src/identity/identity.types.ts`.
- **DB row-count behavior (closed set):**
  - 0 rows → `{ ok: false; code: 'lookup_failed'; reason: <stale-token sentence> }`
  - 1 row → evaluate `is_admin` (proceed to step 6 / 7 of §A)
  - ≥ 2 rows → `{ ok: false; code: 'lookup_failed'; reason: <data-integrity sentence> }`
    (a verifier-accepted account whose `ext_id` matches multiple
    `legendary.players` rows is a data-integrity fault; the column has a
    `UNIQUE` constraint per migration 004, so this branch is unreachable
    in well-formed databases but MUST still be coded fail-closed)
- Migration filename: `data/migrations/014_add_is_admin_to_players.sql`
- New `Auth` taxonomy value in `api-endpoints.md`: `admin-session-required`
- Decision IDs reserved: D-15901, D-15902 (added on execution close)

---

## Scope (In)

### A) Admin Session Helper (Server) — NEW

**File:** `apps/server/src/auth/adminSession.ts` — **new**

Exports:
```ts
export type AdminSessionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'lookup_failed';

export const ADMIN_SESSION_ERROR_CODES: readonly AdminSessionErrorCode[] = [
  'unauthorized',
  'forbidden',
  'lookup_failed',
] as const;

export type AdminSessionResult =
  | { readonly ok: true; readonly accountId: AccountId }
  | { readonly ok: false; readonly code: AdminSessionErrorCode; readonly reason: string };

export async function requireAdminSession(
  request: SessionTokenRequest,
  options: RequireAuthenticatedSessionOptions,
): Promise<AdminSessionResult>;
```

Behavior — control-flow table (authoritative; deviation is a lint failure):

| Step | Condition                                                                         | Result                                                     |
|------|-----------------------------------------------------------------------------------|------------------------------------------------------------|
| 1    | `requireAuthenticatedSession` returns `{ ok: false, ... }`                        | `{ ok: false; code: 'unauthorized'; reason: <see below> }` |
| 2    | DB query throws (exception caught at await boundary)                              | `{ ok: false; code: 'lookup_failed'; reason: <see below> }` |
| 3    | DB query returns **zero** rows                                                    | `{ ok: false; code: 'lookup_failed'; reason: <see below> }` |
| 4    | DB query returns **two or more** rows                                             | `{ ok: false; code: 'lookup_failed'; reason: <see below> }` |
| 5    | DB query returns **one** row, but `is_admin` is missing / `null` / `typeof !== 'boolean'` | `{ ok: false; code: 'lookup_failed'; reason: <see below> }` |
| 6    | DB query returns **one** row, `is_admin === false` (strict)                       | `{ ok: false; code: 'forbidden'; reason: <see below> }`     |
| 7    | DB query returns **one** row, `is_admin === true` (strict)                        | `{ ok: true; accountId }`                                  |

Step-by-step:

1. Call `requireAuthenticatedSession(request, options)`. If it returns
   `{ ok: false, ... }` → return `{ ok: false, code: 'unauthorized', reason:
   <canonical sentence below> }`. Do NOT leak the upstream
   `SessionValidationErrorCode` to the caller — the admin gate's public
   error surface is its own three-value closed union. The canonical
   unauthorized reason string is exactly:
   `"Admin session validation failed: upstream session check rejected the request."`
2. If `requireAuthenticatedSession` returns `{ ok: true, value: accountId }`,
   run:
   ```sql
   SELECT is_admin FROM legendary.players WHERE ext_id = $1
   ```
   with `$1 = accountId` (the `AccountId` brand is structurally a string;
   the WP-052 D-5201 contract guarantees `AccountId === legendary.players.ext_id`
   — see §Locked contract values).
3. If the query throws → return `{ ok: false, code: 'lookup_failed', reason:
   "Failed to read admin authorization for the authenticated account." }`.
4. If the query returns zero rows → return `{ ok: false, code: 'lookup_failed',
   reason: "Authenticated account is not present in the players table." }`.
   (A verifier-accepted session whose `accountId` resolves to no row in
   players indicates a torn write, a stale token after account deletion, or
   a data-integrity fault. Treated as a lookup fault, not a forbidden,
   because the reason is operational not authorization-policy.)
5. If the query returns two or more rows → return `{ ok: false, code:
   'lookup_failed', reason: "Authenticated account resolves to multiple
   players rows (data integrity fault)." }`. (Logically unreachable under
   schema constraints — `ext_id` has a `UNIQUE` constraint per migration
   004 — but still enforced fail-closed.)
6. If the query returns exactly one row but **row-schema validation fails**
   — `row.is_admin === undefined`, `row.is_admin === null`, or
   `typeof row.is_admin !== 'boolean'` — return `{ ok: false, code:
   'lookup_failed', reason: <DB-throw canonical sentence> }`. This defends
   against malformed fake `DatabaseClient` rows in tests and any future
   column-rename drift. Routing as `lookup_failed` (not `forbidden`) is
   deliberate: the operational fault is "we cannot read the flag", not
   "we read it and the user lacks permission".
7. If the query returns exactly one row and `row.is_admin === false`
   (strict triple-equals; no truthy coercion) → return `{ ok: false, code:
   'forbidden', reason: "Authenticated account does not have admin
   privileges." }`.
8. If the query returns exactly one row and `row.is_admin === true`
   (strict triple-equals) → return `{ ok: true, accountId }`. **No other
   code path may produce `ok: true`.**

Required JSDoc:
- Module header citing WP-159, D-15901, D-15902, and the file-isolation
  rationale (single source of truth for admin authorization).
- Function header documenting the composition chain (`requireAuthenticatedSession`
  → DB read of `is_admin`) and the closed-union error surface.

### B) Admin Session Tests — NEW

**File:** `apps/server/src/auth/adminSession.test.ts` — **new**

Test cases (`node:test`):
1. Happy path — valid session + `is_admin = true` → `{ ok: true, accountId }`
2. Upstream failure (missing token) → `{ ok: false, code: 'unauthorized', reason: "Admin session validation failed: upstream session check rejected the request." }` (assert exact canonical sentence)
3. Upstream failure (expired token) → `{ ok: false, code: 'unauthorized', reason: <same canonical sentence as test 2> }`
4. Valid session + `is_admin = false` → `{ ok: false, code: 'forbidden', reason: "Authenticated account does not have admin privileges." }`
5. Valid session + zero matching rows → `{ ok: false, code: 'lookup_failed', reason: "Authenticated account is not present in the players table." }`
6. Valid session + DB throws → `{ ok: false, code: 'lookup_failed', reason: "Failed to read admin authorization for the authenticated account." }`
7. Valid session + multiple matching rows → `{ ok: false, code: 'lookup_failed', reason: "Authenticated account resolves to multiple players rows (data integrity fault)." }`
8. Valid session + one row where `is_admin` is a truthy non-`true` value → `{ ok: false, code: 'lookup_failed', ... }` (row-schema-validation reject — `typeof !== 'boolean'`). Test 8 MUST exercise **at least two distinct non-boolean truthy shapes** (e.g., `1` AND `"true"`, or a string AND an object) to prove absence of coercion across input types. A single value is insufficient — strict triple-equals semantics require multi-shape coverage.
9. Drift-detection: bidirectional `Set` equality between `ADMIN_SESSION_ERROR_CODES`
   and the canonical `AdminSessionErrorCode` set. Use the exact assertion shape:
   ```ts
   const arraySet = new Set(ADMIN_SESSION_ERROR_CODES);
   const unionSet = new Set<AdminSessionErrorCode>([
     'unauthorized',
     'forbidden',
     'lookup_failed',
   ]);
   assert.strictEqual(arraySet.size, unionSet.size);
   for (const code of arraySet) assert.ok(unionSet.has(code));
   for (const code of unionSet) assert.ok(arraySet.has(code));
   ```
   (Forward inclusion + backward inclusion + cardinality match. A one-sided
   check would miss either an extra array entry or a missing union member.)

All DB interactions use an injected fake `DatabaseClient` matching the existing
identity-layer test pattern. No live database required for the unit suite.

Per the WP-052 / WP-112 precedent, tests inject fakes at construction time —
no module-level mocks, no global `fetch` stubbing.

### C) Migration 014 — NEW

**File:** `data/migrations/014_add_is_admin_to_players.sql` — **new**

Content:
```sql
-- WP-159 — Add is_admin column to legendary.players
-- Created 2026-MM-DD per WP-159 / EC-173 / D-15901 / D-15902.
--
-- Purely additive. All existing rows default to is_admin = FALSE. The first
-- admin is set via direct SQL by the operator; subsequent grants come from
-- a future admin-CLI WP.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-running succeeds without error.

ALTER TABLE legendary.players
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- why: COMMENT ON COLUMN documents the WP authority and the
-- operator-granted semantics inline with the column. Schema introspection
-- tools (psql \d+, pgAdmin, automated catalog dumps) surface the comment,
-- keeping the authorization story attached to the data, not buried in
-- migration history.
COMMENT ON COLUMN legendary.players.is_admin IS
    'WP-159: admin authorization flag. Default FALSE. Operator-granted via direct SQL. Read exclusively through apps/server/src/auth/adminSession.ts::requireAdminSession.';
```

### D) API Catalog Taxonomy Update

**File:** `docs/ai/REFERENCE/api-endpoints.md` — **modified**

Two updates per §21 / D-11804:

1. Extend the closed `Auth` taxonomy set with `admin-session-required`,
   defined as: *"Server-validated Hanko session + `is_admin = TRUE` on the
   resolved `legendary.players` row. See WP-159 §A."*
2. Append a `Library-only` row for `requireAdminSession` (per the existing
   `Library-only` precedent for `requireAuthenticatedSession`):
   - `Status`: `Library-only`
   - `Surface`: `apps/server/src/auth/adminSession.ts → requireAdminSession()`
   - `Auth`: `admin-session-required`
   - `Authorizing WP`: `WP-159`
   - `Notes`: composes `requireAuthenticatedSession` + `is_admin` DB read; first caller is WP-107.

### E) DECISIONS.md Updates

**File:** `docs/ai/DECISIONS.md` — **modified**

Append two entries:

- **D-15901** — *Admin authorization composes the WP-112 session orchestrator
  with a single boolean `is_admin` DB column.* The new
  `requireAdminSession(req, options)` returns `AdminSessionResult` (success
  branch carries `AccountId`; failure branch carries the closed-union code
  `'unauthorized' | 'forbidden' | 'lookup_failed'` plus a deterministic
  static `reason` string per §A). The composition shape is forward-compatible
  with a future role/permission system: the call site sees an
  `AdminSessionResult` whose success branch carries an `AccountId` regardless
  of whether authorization is decided by a boolean column or a multi-row
  join.
  Alternatives rejected: (a) extend WP-110's shared-secret gate with a
  per-admin secret — no per-user attribution, fails §22; (b) ship a full
  roles+permissions system now — speculative, blast-radius prohibitive for a
  single caller (WP-107).
- **D-15902** — *Authorization stored as a single `is_admin BOOLEAN` column on
  `legendary.players`; first admin is granted via direct SQL by the operator.*
  Rationale: WP-107 needs `admin vs not-admin` discrimination; finer-grained
  tiers (moderator, support, billing-admin) have no concrete caller. The
  single-column shape can later be replaced by a join against a
  `legendary.player_roles` table without touching `requireAdminSession`
  callers — the function's success shape (`{ ok: true; accountId }`) is
  identical under either backing storage. The bootstrap-first-admin flow is
  deliberately operator-only (no admin-grant UI in this WP) to avoid the
  chicken-and-egg of "who can grant the first admin?".

### F) WORK_INDEX.md Update

**File:** `docs/ai/work-packets/WORK_INDEX.md` — **modified**

- Add WP-159 line under Phase 7 (admin-auth is post-launch hardening).
- Flip WP-107 from `(deferred)` to `Blocked: pending WP-159 (admin-session
  gate)` — link to WP-107's now-drafted body.
- Append both to the dependency-chain notes.

### G) Roadmap Mindmap Update (Optional, Same Commit)

**File:** `docs/05-ROADMAP-MINDMAP.md` — **modified**

- Add WP-159 to a new "Admin & RBAC" cluster (or extend existing "Admin & Route Wiring").
- Flip WP-107 from `⏸ Blocked` to `📝 Drafted — pending WP-159 execution`.
- Bump the Progress Summary and the Last Updated note.

---

## Out of Scope

- **Roles / permissions / role-based admin tiers.** Single `is_admin` boolean only. Future WP if a second caller needs finer discrimination.
- **Audit log of admin actions.** WP-107 (or a follow-up WP) ships the audit table; this WP only produces the `accountId` that an audit log would record.
- **Admin-CLI to grant/revoke `is_admin`.** Operator uses direct SQL for the first admin; later WPs ship a CLI if needed.
- **Cutover of WP-110's `/api/admin/billing/history` route from `requireAdminSecret` to `requireAdminSession`.** Follow-up swap WP.
- **Cookie-carried admin tokens, WebSocket admin auth, or any new transport.** Bearer header only (WP-112 D-11202 unchanged).
- **Migration of historical WP-110 calls in API catalog `Auth` column.** WP-110 rows continue to declare `admin-secret`; only new rows (WP-107 and later) declare `admin-session-required`.
- **Bootstrap first-admin UI or self-claim flow.** Operator-only via SQL.
- **Anything that touches `packages/game-engine/`, `packages/registry/`, `packages/preplan/`, or any client UI** — this is a server-only library addition.

---

## Files Expected to Change

- `apps/server/src/auth/adminSession.ts` — new — `requireAdminSession` helper + closed-union types + canonical array
- `apps/server/src/auth/adminSession.test.ts` — new — 7 unit tests, injected-fake `DatabaseClient`
- `data/migrations/014_add_is_admin_to_players.sql` — new — additive `ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`
- `docs/ai/REFERENCE/api-endpoints.md` — modified — Auth taxonomy + Library-only row
- `docs/ai/DECISIONS.md` — modified — D-15901, D-15902
- `docs/ai/work-packets/WORK_INDEX.md` — modified — add WP-159; flip WP-107 to Blocked-on-WP-159
- `docs/05-ROADMAP-MINDMAP.md` — modified — cluster + Progress Summary refresh

7 files. Under the §00.1 single-session cap (~8 files).

---

## Contract

> **Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - ESM only, Node v22+
> - Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
> - Read-only at the engine/registry/client surface — zero modifications outside `apps/server/src/auth/` + `data/migrations/` + the docs files listed above
> - No new npm dependencies

---

## Acceptance Criteria

- [ ] `apps/server/src/auth/adminSession.ts` exports `requireAdminSession`,
      `AdminSessionResult`, `AdminSessionErrorCode`, and `ADMIN_SESSION_ERROR_CODES`.
- [ ] `requireAdminSession` returns `{ ok: true; accountId }` when the session
      is valid and `is_admin = TRUE` (verified by test 1).
- [ ] `requireAdminSession` returns `{ ok: false; code: 'unauthorized' }` with
      the canonical reason string when `requireAuthenticatedSession` returns
      any failure (verified by tests 2-3 with exact-string assertion).
- [ ] `requireAdminSession` returns `{ ok: false; code: 'forbidden' }` with
      the canonical reason string when the session is valid but `is_admin =
      FALSE` (verified by test 4 with exact-string assertion).
- [ ] `requireAdminSession` returns `{ ok: false; code: 'lookup_failed' }` with
      the appropriate canonical reason string for each cause:
      zero-rows (test 5), DB-throw (test 6), multi-row (test 7) — verified by
      exact-string assertion on each.
- [ ] `requireAdminSession` performs row-schema validation BEFORE the
      `is_admin` boolean check; a non-boolean `is_admin` value (e.g., `1`,
      `"true"`, an object) resolves to `'lookup_failed'`, NOT `'forbidden'`
      and NOT `ok: true` (verified by test 8 with at least two distinct
      non-boolean truthy shapes).
- [ ] `requireAdminSession` uses strict triple-equals on the boolean
      `is_admin` value (post row-schema check); `=== false` → `'forbidden'`,
      `=== true` → `ok: true`. Grep MUST find zero matches for
      `if (row.is_admin)`, `Boolean(row.is_admin)`, or `!!row.is_admin`.
- [ ] `ADMIN_SESSION_ERROR_CODES` array exactly matches `AdminSessionErrorCode`
      union via bidirectional Set equality (drift test 9).
- [ ] Migration 014 applies cleanly against a fresh dev database AND is
      idempotent on re-apply (no error on second invocation).
- [ ] Migration 014 emits a `COMMENT ON COLUMN legendary.players.is_admin`
      statement citing WP-159 and the `requireAdminSession` read path.
- [ ] No file outside `apps/server/src/auth/adminSession.ts` issues a
      `SELECT ... is_admin` against `legendary.players` (repo-wide grep
      verification).
- [ ] `apps/server/src/auth/adminGate.ts`, `sessionToken.logic.ts`,
      `sessionToken.types.ts`, and `hanko/**` are **byte-identical** before
      and after this WP (`git diff --stat` shows zero changes to those files).
- [ ] `apps/server/src/auth/adminSession.ts` imports `SessionTokenRequest`
      and `RequireAuthenticatedSessionOptions` from
      `apps/server/src/auth/sessionToken.types.ts` (exact path; no alias);
      `requireAuthenticatedSession` from
      `apps/server/src/auth/sessionToken.logic.ts` (exact path; no barrel).
- [ ] `docs/ai/REFERENCE/api-endpoints.md` Auth taxonomy block includes the
      new `admin-session-required` value with the WP-159 §A definition.
- [ ] `docs/ai/REFERENCE/api-endpoints.md` Library-only block includes a row
      for `requireAdminSession` citing WP-159.
- [ ] All test files pass: `pnpm --filter @legendary-arena/server test` exits 0.
- [ ] No `Math.random()`, no wall-clock reads, no `fetch` calls, no `axios`,
      no `node-fetch` in any new file (grep verification).
- [ ] No in-memory cache of `is_admin` results in `adminSession.ts`
      (grep for `Map<`, `WeakMap<`, `new Map`, `cache`, `memoize` returns
      zero matches inside the file).

---

## Verification Steps

```pwsh
# All server tests pass (baseline 184/0/66/31 from project baselines — should be 184+7/0/66/31 after this WP)
pnpm --filter @legendary-arena/server test

# Helper exported with correct signature
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "export async function requireAdminSession"
# Expected: 1 match

# Closed union paired with canonical array
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "ADMIN_SESSION_ERROR_CODES"
# Expected: at least 2 matches (declaration + usage in drift test)

# Migration is purely additive
Select-String -Path "data\migrations\014_add_is_admin_to_players.sql" -Pattern "ADD COLUMN IF NOT EXISTS is_admin"
# Expected: 1 match
Select-String -Path "data\migrations\014_add_is_admin_to_players.sql" -Pattern "DROP|TRUNCATE|DELETE|UPDATE"
# Expected: no matches

# Migration documents column via COMMENT ON COLUMN
Select-String -Path "data\migrations\014_add_is_admin_to_players.sql" -Pattern "COMMENT ON COLUMN legendary.players.is_admin"
# Expected: 1 match

# No caller queries is_admin directly outside the helper
Get-ChildItem apps -Recurse -Include *.ts,*.mjs | Select-String -Pattern "is_admin" | Where-Object { $_.Path -notmatch "auth\\adminSession\.(ts|test\.ts)$" }
# Expected: no matches

# adminSession.ts uses no caching primitive
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "new Map|new WeakMap|memoize|cache" -CaseSensitive:$false
# Expected: no matches

# adminSession.ts uses strict triple-equals on is_admin (post row-schema check)
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "is_admin === true|is_admin === false"
# Expected: at least 1 match (strict equality somewhere — bare `if (row.is_admin)` truthy-coerces and fails the next gate)
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "if \(row\.is_admin\)|if \(!row\.is_admin\)|Boolean\(row\.is_admin\)|!!row\.is_admin"
# Expected: no matches (all four truthy-coercion shapes forbidden)

# adminSession.ts performs row-schema validation (typeof check)
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "typeof row\.is_admin"
# Expected: at least 1 match (row-schema guard before the boolean check)

# Imports come from the exact locked sources
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "from '\./sessionToken\.types(\.js)?'"
# Expected: 1 match
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "from '\./sessionToken\.logic(\.js)?'"
# Expected: 1 match

# WP-110 admin gate unchanged
git diff --name-only -- apps/server/src/auth/adminGate.ts apps/server/src/auth/adminGate.test.ts
# Expected: no output

# WP-112 orchestrator unchanged
git diff --name-only -- apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/sessionToken.logic.test.ts
# Expected: no output

# WP-126 Hanko verifier unchanged
git diff --name-only -- apps/server/src/auth/hanko/
# Expected: no output

# Auth taxonomy extended
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "admin-session-required"
# Expected: at least 2 matches (taxonomy block + Library-only row)

# No forbidden primitives in adminSession.ts
Select-String -Path "apps\server\src\auth\adminSession.ts" -Pattern "Math\.random|Date\.now|performance\.now|require\(|axios|node-fetch"
# Expected: no matches

# Build passes
pnpm --filter @legendary-arena/server build
# Expected: exit code 0
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-15901 and D-15902
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-159 marked `[x]` and WP-107
      flipped from Blocked-on-WP-159 to **Drafted, ready for execution**
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated per §21
- [ ] `docs/05-ROADMAP-MINDMAP.md` updated per §G
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 NOT INVOKED (no engine, registry, scoring, or replay surface touched)
- [ ] 01.6 post-mortem MANDATORY (new long-lived abstraction: `requireAdminSession`
      becomes the canonical admin-authorization seam for every future
      admin-only route)

---

## Lint Self-Review

Pending — to be completed before execution. Self-review must confirm:
- §1 structure complete (all 10 required sections present and non-empty)
- §2 non-negotiable constraints block present with engine-wide + packet-specific + session protocol + locked values
- §3 assumes lists every prior WP and external state
- §4 context references are specific (no "read the docs")
- §11 authentication clarity satisfied (verifier composition, fail-closed default, no new transport)
- §13 verification steps have expected outputs
- §14 acceptance criteria are binary and observable (each pass/fail; count grows with each reviewer-tightened expansion — last count not pinned to keep this self-review stable across edits)
- §15 definition of done lists STATUS / DECISIONS / WORK_INDEX updates
- §17 vision alignment block present with explicit clauses + non-goal proximity check
- §21 API catalog update obligation satisfied (taxonomy + Library-only row)
