# WP-107 — Profile Integrity / Anti-Cheat Surface

**Status:** Draft (drafted 2026-05-17 alongside WP-159; **ready for execution** — WP-159 shipped 2026-05-17 via commit `295eec6` / PR #85)
**Primary Layer:** Server (`apps/server/src/profile/admin/**`, `apps/server/src/identity/**`) + Database (`data/migrations/015_*`) + Reference (`docs/ai/REFERENCE/api-endpoints.md`)
**Dependencies:**
- WP-052 (`legendary.players`; `AccountId` brand)
- WP-101 (`handle` lookup; player-by-handle resolution)
- WP-102 (public profile read pattern)
- WP-104 (owner profile read pattern; `legendary.player_profiles`)
- WP-112 (`requireAuthenticatedSession`)
- WP-126 (Hanko verifier)
- WP-131 (`configureSessionValidation` production wiring)
- **WP-159** (`requireAdminSession` — this WP's first caller; **shipped 2026-05-17** via commit `295eec6` / PR #85)
- WP-053 (`competitive_scores` table — read-only correlation source for integrity flags)
- WP-105 (`player_badges` — context for "what does this player have")

**Explicit Non-Dependencies:** WP-110 (admin billing surface; separate concern, separate gate); WP-108 (owner billing UI; not admin); WP-105 (badges are display data, not integrity signals).

**Blocker cleared:** WP-159 shipped 2026-05-17 (commit `295eec6` / PR #85); `requireAdminSession` is live at `apps/server/src/auth/adminSession.ts` and the `admin-session-required` Auth taxonomy value is present in `docs/ai/REFERENCE/api-endpoints.md`. WP-107 is now ready for execution. Historical context: until WP-159 landed, this WP could not ship any admin-attribution surface without re-using WP-110's shared-secret gate — which would have failed this WP's §22 auditability requirement.

---

## Goal

After this session, an **admin-only profile integrity surface** exists that allows
authenticated administrators to:

1. **View extended profile state** for any player — public + owner fields plus
   admin-only fields (suspension status, integrity flag history, raw competitive
   score counts) attributed to a specific player by `accountId` or `handle`.
2. **Suspend a player account** — toggles `is_suspended = TRUE`; suspended
   players cannot submit new competitive scores (WP-053 score-submission
   endpoint gains a `is_suspended` check at intake).
3. **Unsuspend a player account** — toggles `is_suspended = FALSE`.
4. **Read the audit log** of admin actions taken on a given account — every
   `requireAdminSession`-gated mutation appends one row.

Every admin action is **attributed** to the acting admin's `accountId` (the
prerequisite that WP-159 provides). The surface is **read-mostly** — only two
mutation endpoints (suspend / unsuspend), each writing one boolean change plus
one audit row.

The result: enough integrity tooling for a small operations team to address
the most common abuse vectors (score fraud, harassment-driven impersonation
attempts) without shipping a full moderation console.

---

## Justification

### Operational necessity (post-WP-053 / WP-054 / WP-101)

Competitive score submission (WP-053) and public leaderboards (WP-054, WP-149,
WP-150) are live. Handles are claimable (WP-101). The combination creates a
small but real abuse surface:

- A player submits a fraudulent competitive score; today there is no admin
  surface to disable that account's future submissions.
- A handle is squatted or used for harassment; today there is no admin surface
  to flag the account.
- An audit-trail-free actor can suspend the wrong account; today there is no
  log of who took which action when.

WP-107 is the minimum-viable response. It does **not** ship a full moderation
console (filters, search, bulk actions, notifications) — those belong in a
later WP if growth justifies them.

### Scope discipline

The §3 trigger surface is large in principle: every gameplay surface (lobby,
match, score submission, profile, leaderboard, replay) has integrity concerns.
This WP deliberately limits scope to **the player-account axis** —
suspend/unsuspend an entire account — because:

1. **Granular per-action moderation** (e.g., "void this specific score") is a
   different shape: it needs per-record state machines, dispute history, and
   user-visible notification. None of those exist today.
2. **Account-level suspension** is composable with every existing surface via
   a single intake check. Score submission, replay submission, profile edits,
   and team membership all read from `legendary.players`; the
   `is_suspended` column gates them all with one read.
3. **The audit log establishes the seam** for finer-grained moderation later.
   Once the log exists, the next WP can add per-record moderation actions
   that write to the same table.

D-10701, D-10702, D-10703 record these scope decisions.

---

## Session Context

WP-159 (executed first) ships:
- `requireAdminSession(req, options): Promise<AdminSessionResult>` returning
  `{ ok: true; accountId }` for admin-authenticated requests.
- `is_admin BOOLEAN` column on `legendary.players` (migration 014).
- `admin-session-required` value in the `api-endpoints.md` Auth taxonomy.

This WP composes WP-159's primitive at every admin route and adds:
- `is_suspended BOOLEAN` column on `legendary.players` (migration 015).
- `legendary.admin_actions` table — append-only audit log (migration 015).
- Three new endpoints under `/api/admin/players/` (one read, two mutations).
- An intake check in WP-053's score-submission route — STOP and ask if
  modifying WP-053 is in scope (it should NOT be; the check belongs in a
  shared `requireUnsuspendedAccount` helper this WP also ships, and WP-053's
  route imports the helper rather than this WP editing the route).

**Scope deliberately excluded:**
- Granular per-record moderation (void specific score, hide specific replay,
  delete specific profile link)
- User-visible notification when suspended (banner, email, in-product)
- Self-service appeal flow
- Search / filter / bulk-action moderation console UI
- IP, device, or pattern-based fraud detection
- Multi-tier admin (moderator vs admin)
- Cross-account correlation tools

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`.

**Vision clauses touched:** §3 (Player Trust & Fairness), §13 (Competitive
Integrity), §14 (Explicit Decisions, No Silent Drift), §22 (Auditability).

**Conflict assertion:** No conflict.

- **§3 Player Trust & Fairness.** Suspending an account is a high-impact
  player-visible (eventually) action. This WP defines the suspension
  *capability* with full audit-log attribution; it does NOT define an appeal
  flow or notification UX (deferred). Per the §3 spirit (transparency over
  silent enforcement), every suspension MUST write an audit row with the
  acting admin's `accountId`, the target `accountId`, an ISO-8601 timestamp,
  and a free-text `reason` field (server-enforced non-empty).
- **§13 Competitive Integrity.** The score-submission intake check is the
  load-bearing tie to competitive integrity. Suspended accounts cannot
  submit new scores; existing scores remain on leaderboards (visibility
  policy for prior submissions is deferred — a per-record moderation WP
  could later add hide/redact).
- **§14 Explicit Decisions, No Silent Drift.** Three decision points
  (D-10701, D-10702, D-10703) record scope discipline.
- **§22 Auditability.** Every admin action writes one row to
  `legendary.admin_actions`. The table is append-only (no UPDATE, no DELETE
  paths in any new file).

**Non-Goal proximity check:**
- NG-1 (no gameplay-level enforcement): clear — this WP touches no engine
  surface; the score-submission intake check is at the HTTP layer, not the
  engine.
- NG-2 through NG-7: N/A — no monetization, no entitlement mutation, no UI.

**Determinism preservation:** N/A. WP-107 touches no engine, registry,
scoring, replay, RNG, or simulation surface. The competitive-score intake
gate is at the HTTP intake (before any engine call); it does not change
engine-side scoring math for accepted submissions.

---

## Funding Surface Gate (§20)

**§20 N/A.** WP-107 introduces a backend admin surface with no user-visible
funding, donation, or attribution UI.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

WP-107 adds three new HTTP endpoints. §21 fires.

**Required catalog updates:**

1. **`GET /api/admin/players/:handle/integrity`**
   - `Status`: `Wired`
   - `Auth`: `admin-session-required`
   - `Authorizing WP`: WP-107
   - `Notes`: read-only; admin-attributed via `requireAdminSession`; LIMIT 100 on audit-log tail
2. **`POST /api/admin/players/:handle/suspend`**
   - `Status`: `Wired`
   - `Auth`: `admin-session-required`
   - `Authorizing WP`: WP-107
   - `Notes`: writes one row to `legendary.admin_actions`; idempotent (re-suspending a suspended account is a no-op + audit row)
3. **`POST /api/admin/players/:handle/unsuspend`**
   - `Status`: `Wired`
   - `Auth`: `admin-session-required`
   - `Authorizing WP`: WP-107
   - `Notes`: writes one row to `legendary.admin_actions`; idempotent

Plus a `Library-only` row for `requireUnsuspendedAccount` (the shared intake helper).

---

## Assumes

- **WP-159 complete** — `requireAdminSession` exists at
  `apps/server/src/auth/adminSession.ts` with the signature locked in WP-159 §A;
  the `is_admin` column exists on `legendary.players` (migration 014 applied).
- WP-052 / WP-101 / WP-102 / WP-104 / WP-112 / WP-126 / WP-131 / WP-053
  complete.
- `legendary.players` exists with `handle` column (per WP-101 migration 008).
- `legendary.competitive_scores` exists per WP-053.
- `apps/server/src/score/scoreSubmission.routes.ts` (or equivalent — STOP and
  confirm filename during execution) exists and imports auth helpers from
  `apps/server/src/auth/`.
- `pnpm --filter @legendary-arena/server build` exits 0.

WP-159 completed 2026-05-17 (commit `295eec6` / PR #85); all assumes are met as of this WP's drafting. Re-verify at execution time per `01.4` pre-flight.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary (server-only; no engine surface)
- `docs/ai/REFERENCE/00.2-data-requirements.md` §1 (players entity), §Competitive Scoring (score-submission shape)
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` §11 (Authentication Clarity), §17 (Vision Alignment), §21 (Catalog Obligation)
- `docs/ai/REFERENCE/api-endpoints.md` (existing taxonomy and Library-only block)
- `docs/ai/DECISIONS.md` — scan D-5201, D-9905, D-11001, D-11002, D-11804, D-15901, D-15902
- `docs/ai/work-packets/WP-159-admin-session-gate.md` (the gate this WP consumes)
- `apps/server/src/auth/adminSession.ts` (post-WP-159 — the helper this WP imports)
- `apps/server/src/profile/ownerProfile.routes.ts` (handle-resolution + response-shape precedent)
- `apps/server/src/profile/ownerProfile.types.ts` (per-section profile typing precedent)
- `data/migrations/004_create_players_table.sql` and `008_add_handle_to_players.sql` (table being extended)

---

## Non-Negotiable Constraints

### Engine-wide
- Full file contents for every new or modified file (no diffs, no snippets)
- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- All commands use `pnpm` — never `npm run`
- No `axios` or `node-fetch` — built-in `fetch` only

### Packet-specific
- Every admin route MUST call `requireAdminSession(request, options)` as the
  first action in the route handler. No route may decide authorization inline.
- Every successful admin **mutation** MUST execute inside an explicit
  database transaction owned by the **logic layer**
  (`adminProfile.logic.ts`), NOT the route layer. The transaction shape is
  exactly: `BEGIN → UPDATE legendary.players → INSERT legendary.admin_actions → COMMIT`.
  If any step fails, the transaction MUST `ROLLBACK` and the route returns
  500 with `{ code: 'internal_error' }`. The audit `INSERT` MUST complete
  before the `COMMIT`; no fire-and-forget audit writes.
- The `DatabaseClient` passed into logic functions MUST support transaction
  scoping (no implicit autocommit). Logic functions accept a client; route
  handlers do not begin transactions.
- `legendary.admin_actions` is **append-only**. No new file may emit
  `UPDATE legendary.admin_actions` or `DELETE FROM legendary.admin_actions`.
  The DB-level `CHECK (action_type IN ('suspend', 'unsuspend'))` constraint
  enforces the closed union at insertion time.
- The suspension `UPDATE` MUST be implemented as a single unconditional
  set, not a read-modify-write: `UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2`.
  Duplicate updates under concurrent admin actions are acceptable and
  expected; idempotency is DB-enforced, not application-enforced.
- `GET /api/admin/players/:handle/integrity` MUST compose its response from
  a single SQL transaction (one `BEGIN`/`COMMIT` pair at isolation level
  `REPEATABLE READ`) OR from a single JOINed `SELECT`, so the profile-state
  read and the audit-log tail read see the same snapshot. No multi-connection
  composition.
- An admin MUST NOT suspend their own account. The check is
  `actingAccountId === targetAccountId` after handle resolution; on match
  the route returns 400 with `{ code: 'invalid_request', reason: 'Admins cannot suspend their own account.' }`.
  The check applies to both `POST /suspend` and `POST /unsuspend`.
- The score-submission intake check MUST live in a shared helper
  (`requireUnsuspendedAccount`) imported by WP-053's route. WP-107 may NOT
  inline the check inside WP-053's route file. WP-107 may **add a single
  import line** to WP-053's route file but may not modify its other logic.
  The guard MUST NOT introduce any new imports beyond
  `requireUnsuspendedAccount`, and MUST NOT alter any existing error-code
  path except the new `'suspended'` case.
- Migration 015 MUST be purely additive (one `ALTER` + one
  `CREATE TABLE IF NOT EXISTS` + one `CREATE INDEX IF NOT EXISTS`).
- Migration 015 MUST be idempotent.
- All admin mutations MUST require a non-empty `reason: string` in the
  request body. The reason is `trim`-normalized before validation; the
  trimmed value MUST be 1–500 characters inclusive. The trimmed reason is
  stored verbatim in the audit-log row.
- Must NOT modify:
  - `apps/server/src/auth/adminSession.ts` (WP-159 contract is locked)
  - `apps/server/src/auth/adminGate.ts` (WP-110 contract is locked)
  - `apps/server/src/auth/sessionToken.logic.ts` or `sessionToken.types.ts` (WP-112 contract is locked)
  - `apps/server/src/auth/hanko/**` (WP-126 contract is locked)
  - Any leaderboard or score-computation logic
  - The engine, registry, preplan, or any client package

### Session protocol
- Before editing WP-053's score-submission route, STOP and confirm the filename
  and the helper import shape with the operator. Modifying the wrong file in
  the score-submission layer is a high-blast-radius mistake.
- If WP-159's `requireAdminSession` signature differs from what this WP assumes
  (per §Assumes), STOP — do not modify either WP's contract. Raise the drift.

### Locked contract values
- Admin route prefix: `/api/admin/players/`
- Route paths: `:handle` (NOT `:accountId`) — admins identify players by handle
  in the URL; the route resolves `handle → accountId` server-side via the
  WP-101 lookup pattern (`findAccountByHandle`).
- Suspension column: `is_suspended BOOLEAN NOT NULL DEFAULT FALSE` on
  `legendary.players`.
- Suspension `UPDATE` shape (verbatim): `UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2;`
- Audit table: `legendary.admin_actions` with columns + constraints:
  - `action_id bigserial PRIMARY KEY`
  - `acting_account_id text NOT NULL REFERENCES legendary.players(ext_id) ON DELETE RESTRICT`
  - `target_account_id text NOT NULL REFERENCES legendary.players(ext_id) ON DELETE RESTRICT`
  - `action_type text NOT NULL CHECK (action_type IN ('suspend', 'unsuspend'))`
  - `reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500)`
  - `created_at timestamptz NOT NULL DEFAULT now()`
- Audit-log index: `CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON legendary.admin_actions (target_account_id, created_at DESC, action_id DESC);`
- Audit-log query `ORDER BY` (verbatim): `ORDER BY created_at DESC, action_id DESC` — the `action_id` tiebreaker resolves same-millisecond `created_at` collisions deterministically.
- Closed-union `AdminPlayerActionType = 'suspend' | 'unsuspend'`
- Closed-union error codes:
  - `'unauthorized'` | `'forbidden'` | `'not_found'` | `'invalid_request'` | `'internal_error'`
- `AdminProfileResponse` exact shape (response body for `GET /integrity`):
  ```ts
  type AdminProfileResponse = {
    accountId: AccountId;            // text; matches legendary.players.ext_id
    handle: string;                  // canonical handle
    isSuspended: boolean;
    recentAuditLog: AuditLogEntry[]; // capped at LIMIT 100, DESC
  };
  type AuditLogEntry = {
    actionId: string;                // bigserial → string at JSON boundary
    actingAccountId: AccountId;
    actionType: AdminPlayerActionType;
    reason: string;
    createdAt: string;               // ISO-8601 (timestamptz → ISO string)
  };
  ```
  **Note on §Goal item 1 narrowing:** the admin profile endpoint returns
  admin-only fields. Public/owner profile composition (display name,
  badges, replays, etc.) is reached by admins via the existing WP-102 /
  WP-104 endpoints; composing those into this response is out of scope
  to keep the locked surface narrow.
- `AdminActionRequest` exact shape (request body for `POST /suspend` and `POST /unsuspend`):
  ```ts
  type AdminActionRequest = { reason: string }; // 1–500 chars after trim
  ```
- `AdminActionResponse` exact shape (response body for both mutations):
  ```ts
  type AdminActionResponse = { ok: true; actionId: string };
  ```
- `requireUnsuspendedAccount` → HTTP error mapping (locked):
  - `'suspended'` → HTTP 403, body `{ code: 'forbidden', reason: 'Account is suspended.' }`
  - `'lookup_failed'` → HTTP 500, body `{ code: 'internal_error' }`
- Self-suspension/self-unsuspension forbidden: route returns 400 with body
  `{ code: 'invalid_request', reason: 'Admins cannot suspend their own account.' }`
  when `actingAccountId === targetAccountId`.
- Reason normalization: `reason.trim()` applied before validation; trimmed
  length MUST be `≥ 1` AND `≤ 500`. Whitespace-only reason rejected.
- `GET /integrity` audit-log tail: `LIMIT 100` (read-mostly bound; full-history
  endpoint deferred to later moderation WP).
- Migration filename: `data/migrations/015_add_player_suspension_and_admin_actions.sql`
- Decision IDs reserved: D-10701, D-10702, D-10703 (added on execution close)

---

## Scope (In)

### A) Migration 015 — NEW

**File:** `data/migrations/015_add_player_suspension_and_admin_actions.sql` — **new**

- `ALTER TABLE legendary.players ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;`
- `CREATE TABLE IF NOT EXISTS legendary.admin_actions (...)` per §Locked contract values.
- Index: `CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON legendary.admin_actions (target_account_id, created_at DESC);`

### B) Admin Profile Types — NEW

**File:** `apps/server/src/profile/admin/adminProfile.types.ts` — **new**

Closed-union codes, `AdminProfileResponse`, `AdminActionRequest`, `AdminActionResponse`, `AuditLogEntry`.

### C) Admin Profile Logic — NEW

**Files:**
- `apps/server/src/profile/admin/adminProfile.logic.ts` — `getAdminProfileView(database, handle)`, `suspendPlayer(database, actingAccountId, targetAccountId, reason)`, `unsuspendPlayer(...)`, `getAdminActionsForPlayer(database, targetAccountId, limit)`.
- `apps/server/src/profile/admin/adminProfile.logic.test.ts` — unit tests with injected fake `DatabaseClient`.

### D) Shared Intake Helper — NEW

**Files:**
- `apps/server/src/auth/requireUnsuspendedAccount.ts` — `requireUnsuspendedAccount(database, accountId)` returning `Result<void>` with closed-union code `'suspended' | 'lookup_failed'`.
- `apps/server/src/auth/requireUnsuspendedAccount.test.ts`

### E) Admin Profile Routes — NEW

**Files:**
- `apps/server/src/profile/admin/adminProfile.routes.ts` — `registerAdminProfileRoutes(router, database)` exposing:
  - `GET /api/admin/players/:handle/integrity`
  - `POST /api/admin/players/:handle/suspend`
  - `POST /api/admin/players/:handle/unsuspend`
- `apps/server/src/profile/admin/adminProfile.routes.test.ts`

### F) Route Registration

**File:** `apps/server/src/server.mjs` — **modified** — add import + `registerAdminProfileRoutes(server.router, pool)` after existing `registerAdminBillingRoutes`.

### G) Score Submission Intake Hook

**File:** `apps/server/src/score/<scoreSubmission route filename — confirm at execution>` — **modified**

Add exactly ONE import line + ONE early-return guard in the score-submission
handler that calls `requireUnsuspendedAccount(database, accountId)` after the
existing session-validation step and before any DB write. If the guard
returns `{ ok: false; code: 'suspended' }`, the route returns 403 with
`{ code: 'forbidden', reason: 'Account is suspended.' }`.

**Out-of-scope hardening:** no other changes to the score-submission file.

### H) API Catalog Update

**File:** `docs/ai/REFERENCE/api-endpoints.md` — **modified** — three Wired rows + one Library-only row per §21.

### I) DECISIONS.md Updates

**File:** `docs/ai/DECISIONS.md` — **modified** — D-10701 (scope: account-level suspension only), D-10702 (audit log is append-only single-table), D-10703 (handle in URL, not accountId).

### J) WORK_INDEX + Mindmap Updates

**Files:** `docs/ai/work-packets/WORK_INDEX.md` (mark `[x]` on completion) + `docs/05-ROADMAP-MINDMAP.md` (move WP-107 from Drafted to ✅).

---

## Out of Scope

- Granular per-record moderation (void score, hide replay, redact profile link)
- User-facing suspension notification (banner, email, in-product modal)
- Self-service appeal flow
- Moderation console UI (search, filter, bulk actions, dashboards)
- IP / device / pattern-based fraud detection
- Multi-tier admin (moderator vs admin)
- Cross-account correlation tooling
- Editing or deleting audit log rows (append-only)
- Modifying competitive score computation, leaderboard ordering, or PAR calculation
- Suspending teams, leaderboard entries, or replays directly
- Migrating WP-110's billing admin surface from `requireAdminSecret` to `requireAdminSession` (separate cutover WP)
- Any change to engine, registry, preplan, or client packages
- New migration on any table other than `legendary.players` and the new `legendary.admin_actions`

---

## Files Expected to Change

- `data/migrations/015_add_player_suspension_and_admin_actions.sql` — new
- `apps/server/src/profile/admin/adminProfile.types.ts` — new
- `apps/server/src/profile/admin/adminProfile.logic.ts` — new
- `apps/server/src/profile/admin/adminProfile.logic.test.ts` — new
- `apps/server/src/profile/admin/adminProfile.routes.ts` — new
- `apps/server/src/profile/admin/adminProfile.routes.test.ts` — new
- `apps/server/src/auth/requireUnsuspendedAccount.ts` — new
- `apps/server/src/auth/requireUnsuspendedAccount.test.ts` — new
- `apps/server/src/server.mjs` — modified — wire admin profile routes
- `apps/server/src/score/<score submission route>` — modified — single intake guard
- `docs/ai/REFERENCE/api-endpoints.md` — modified — three Wired rows + Library-only row
- `docs/ai/DECISIONS.md` — modified — D-10701, D-10702, D-10703
- `docs/ai/work-packets/WORK_INDEX.md` — modified — mark complete
- `docs/05-ROADMAP-MINDMAP.md` — modified — WP-107 → ✅

12-14 files (final count depends on the score-submission route filename). Above
the recommended 8-file soft cap; consider splitting into WP-107A (gate + audit
table + admin routes) and WP-107B (score-submission intake hook) if execution
runs hot. Decision deferred to execution-time judgement.

---

## Contract

> **Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - ESM only, Node v22+
> - Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
> - Append-only audit table — zero UPDATE / DELETE statements in any new file
> - All admin routes gated by `requireAdminSession` as the first handler action

---

## Acceptance Criteria

- [ ] All three new endpoints (`GET integrity`, `POST suspend`, `POST unsuspend`) return 200 with the documented response shape on success
- [ ] `GET /integrity` response body matches `AdminProfileResponse` exactly — 4 fields (`accountId`, `handle`, `isSuspended`, `recentAuditLog`); audit log capped at 100 rows; ordered `created_at DESC, action_id DESC`
- [ ] `GET /integrity` profile + audit-log composition reads see a consistent snapshot (single `BEGIN…COMMIT` at `REPEATABLE READ` OR single JOINed `SELECT`)
- [ ] All three endpoints return 401 when `requireAdminSession` returns `unauthorized` (verified by missing-session test)
- [ ] All three endpoints return 403 when `requireAdminSession` returns `forbidden` (verified by non-admin-session test)
- [ ] Suspending a non-existent handle returns 404 with `{ code: 'not_found' }`
- [ ] Suspending with an empty / whitespace-only `reason` returns 400 with `{ code: 'invalid_request' }` (verified by both `''` and `'   '` test inputs)
- [ ] Suspending with `reason.trim().length > 500` returns 400 with `{ code: 'invalid_request' }`
- [ ] An admin attempting to suspend or unsuspend their own account (matched after handle → `ext_id` resolution) returns 400 with `{ code: 'invalid_request' }` and writes zero audit rows
- [ ] Every successful suspend/unsuspend writes exactly one row to `legendary.admin_actions` inside the same SQL transaction as the column update; if the audit `INSERT` fails, the column update is rolled back and the route returns 500 (verified by injected-fault test)
- [ ] The DB-level `CHECK (action_type IN ('suspend', 'unsuspend'))` constraint rejects any other value at insertion time
- [ ] FK constraints on `acting_account_id` / `target_account_id` reject inserts referencing missing `legendary.players.ext_id` rows
- [ ] Re-suspending a suspended account is a no-op on `is_suspended` but DOES write an audit row (idempotent at column, observable at log); the column update is the unconditional `UPDATE … SET is_suspended = TRUE`, never a read-modify-write
- [ ] Score-submission endpoint returns 403 with `{ code: 'forbidden', reason: 'Account is suspended.' }` when the submitting account is suspended; returns 500 with `{ code: 'internal_error' }` when `requireUnsuspendedAccount` returns `'lookup_failed'` (both verified by intake-guard test)
- [ ] `legendary.admin_actions` contains zero `UPDATE` or `DELETE` statements across all new files (grep verification)
- [ ] `adminProfile.logic.ts` contains exactly one `BEGIN` site per mutation function; route handlers contain zero `BEGIN` / `COMMIT` / `ROLLBACK` literals
- [ ] Migration 015 applies cleanly AND is idempotent (re-apply succeeds; CHECK + FK constraints survive re-apply)
- [ ] Score-submission route `git diff --stat` shows exactly one file, ≤ 6 lines changed, and no new imports beyond `requireUnsuspendedAccount`
- [ ] All test files pass: `pnpm --filter @legendary-arena/server test`
- [ ] `apps/server/src/auth/adminSession.ts` is byte-identical before and after this WP

---

## Verification Steps

```pwsh
# Tests pass
pnpm --filter @legendary-arena/server test

# Admin routes always gate first
Select-String -Path "apps\server\src\profile\admin\adminProfile.routes.ts" -Pattern "requireAdminSession" -Context 0,2
# Expected: at least 3 matches (one per route), each near the top of its handler

# Audit table is append-only across all new files
Get-ChildItem apps\server\src\profile\admin\ -Recurse -Include *.ts | Select-String -Pattern "UPDATE legendary.admin_actions|DELETE FROM legendary.admin_actions"
# Expected: no matches

# Migration is purely additive
Select-String -Path "data\migrations\015_add_player_suspension_and_admin_actions.sql" -Pattern "DROP|TRUNCATE"
# Expected: no matches

# Migration carries CHECK + FK + length constraints
Select-String -Path "data\migrations\015_add_player_suspension_and_admin_actions.sql" -Pattern "CHECK \(action_type IN|REFERENCES legendary\.players\(ext_id\)|length\(reason\)"
# Expected: at least 4 matches (1 CHECK, 2 FKs, 1 length)

# Transaction ownership lives in logic, not routes
Select-String -Path "apps\server\src\profile\admin\adminProfile.logic.ts" -Pattern "\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b"
# Expected: at least 6 matches (BEGIN/COMMIT/ROLLBACK across suspend + unsuspend)
Select-String -Path "apps\server\src\profile\admin\adminProfile.routes.ts" -Pattern "\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b"
# Expected: no matches

# Suspension UPDATE is unconditional set, not read-modify-write
Select-String -Path "apps\server\src\profile\admin\adminProfile.logic.ts" -Pattern "UPDATE legendary\.players SET is_suspended"
# Expected: at least 1 match; the statement carries `WHERE ext_id =` and no surrounding SELECT-then-UPDATE pattern

# Self-suspension guard exists
Select-String -Path "apps\server\src\profile\admin\adminProfile.logic.ts","apps\server\src\profile\admin\adminProfile.routes.ts" -Pattern "actingAccountId === targetAccountId|cannot suspend their own"
# Expected: at least 1 match

# Reason trim + length cap applied
Select-String -Path "apps\server\src\profile\admin\" -Recurse -Pattern "\.trim\(\)" -Include *.ts
# Expected: at least 1 match in the route or logic layer
Select-String -Path "apps\server\src\profile\admin\" -Recurse -Pattern "500" -Include *.ts
# Expected: at least 1 match (the length cap)

# WP-159 contract unchanged
git diff --name-only -- apps/server/src/auth/adminSession.ts apps/server/src/auth/adminSession.test.ts
# Expected: no output

# WP-112 + WP-126 contracts unchanged
git diff --name-only -- apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/hanko/
# Expected: no output

# Score-submission file change is minimal (only the import + guard)
git diff --stat -- apps/server/src/score/
# Expected: one file, small line count (≤ 6 lines changed)

# Catalog updated
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/admin/players/" 
# Expected: at least 3 matches
```

---

## Open Questions (Resolve Before Execution)

These ambiguities should be settled before this WP enters execution. Each is
listed with a recommended default; the recommendation becomes the locked
value at execution-time review unless explicitly overridden.

1. **Score-submission route filename.** Need to confirm the exact file under
   `apps/server/src/score/` that handles `POST` score submissions. Recommended
   action at execution: grep `requireAuthenticatedSession` under `apps/server/src/score/`
   to identify the single intake route.
2. **Suspended-account read visibility.** Should public profile reads
   (`/api/players/:handle/profile`) hide suspended accounts (404)? **Recommended
   default: NO** — public reads remain available; suspension only blocks
   writes (score submission, profile edits, team join). Visibility hiding is
   a separate moderation WP.
3. **Existing scores from suspended accounts.** Stay on leaderboards or hide?
   **Recommended default: STAY** — historical scores remain; suspension is
   forward-only. Retroactive hiding is a per-record moderation WP, not this
   one.
4. **Team membership when suspended.** Auto-leave teams? **Recommended default:
   NO** — team affiliations remain; team-side display of suspended members is
   a future team-moderation WP.
5. **Audit log retention.** Indefinite or N-day? **Recommended default: indefinite
   for this WP** — retention policy is a Phase-7 ops decision, separate WP.
6. **Should WP-107 split into A/B?** If file count exceeds 12 at execution
   time, recommend split: WP-107A = gate + audit table + admin routes (8
   files); WP-107B = score-submission intake hook (3 files including test).
   **Recommended default: ship as one WP unless execution-time file count
   forces a split.**

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] All §Open Questions resolved and locked in §Locked contract values
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated with D-10701, D-10702, D-10703
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-107 marked `[x]`
- [ ] `docs/05-ROADMAP-MINDMAP.md` Phase 9 row updated (3/4 → 4/4)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated per §21 (3 new rows + Library-only row)
- [ ] No files outside the "Files Expected to Change" list were modified
- [ ] 01.5 NOT INVOKED (no engine surface)
- [ ] 01.6 post-mortem MANDATORY (first admin-mutation surface; audit-log primitive becomes a new code category)

---

## Lint Self-Review

Pending — to be completed before WP-107 enters execution. WP-159 (the
primary structural blocker) shipped 2026-05-17, so the self-review may
now run. Self-review must additionally confirm:
- All §Open Questions resolved
- Score-submission route filename is identified and locked
- The "split into A/B?" question is answered

---

## Blocking Note (Historical — Blocker Cleared)

**WP-159 shipped 2026-05-17** (commit `295eec6` / PR #85). The structural
blocker that originally gated this packet is cleared:
- `apps/server/src/auth/adminSession.ts` exists with the locked
  `requireAdminSession(request, options): Promise<AdminSessionResult>`
  signature.
- Migration 014 (`014_add_is_admin_to_players.sql`) is in
  `data/migrations/`; the `is_admin BOOLEAN` column is on
  `legendary.players`.
- The `admin-session-required` value is present in the
  `docs/ai/REFERENCE/api-endpoints.md` Auth taxonomy.

At session start, re-verify per `01.4` pre-flight (the dependency state
above is a snapshot from this WP's drafting; pre-flight is the
authoritative re-check).
