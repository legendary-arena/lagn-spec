# WP-107 — Profile Integrity / Anti-Cheat Surface

**Status:** Draft — **READY TO EXECUTE** (2026-05-23). Phase 1 close-out gates all green post-Option-A RS-1 resolution: pre-flight `01.4` re-run = `READY TO EXECUTE`; copilot check `01.7` = `PASS` (CONFIRM); lint gate `00.3` self-review = `PASS` (all 38 Final Gate conditions). Structural dependency on WP-159 cleared 2026-05-17 via commit `295eec6` / PR #85. See §Lint Self-Review, §Pre-Flight Verdict (initial + re-run), and §Copilot Check Verdict blocks below. Session prompt at [`docs/ai/invocations/session-wp107-profile-integrity-anti-cheat-surface.md`](../invocations/session-wp107-profile-integrity-anti-cheat-surface.md) needs §Pre-Execution Checks reconciled against Option A scope (§G removal) before execution opens.
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

**Structural blocker cleared:** WP-159 shipped 2026-05-17 (commit `295eec6` / PR #85); `requireAdminSession` is live at `apps/server/src/auth/adminSession.ts` and the `admin-session-required` Auth taxonomy value is present in `docs/ai/REFERENCE/api-endpoints.md`. **Phase 1 close-out gates remain pending** before execution opens: pre-flight (`01.4`) must produce `READY TO EXECUTE`; copilot check (`01.7`) must produce `PASS` or `RISK`; lint gate (`00.3`) self-review must be completed inline in §Lint Self-Review. Historical context: until WP-159 landed, this WP could not ship any admin-attribution surface without re-using WP-110's shared-secret gate — which would have failed this WP's §22 auditability requirement.

---

## Goal

After this session, an **admin-only profile integrity surface** exists that allows
authenticated administrators to:

1. **View extended profile state** for any player — public + owner fields plus
   admin-only fields (suspension status, integrity flag history, raw competitive
   score counts) attributed to a specific player by `accountId` or `handle`.
2. **Suspend a player account** — toggles `is_suspended = TRUE`. WP-107
   ships the shared `requireUnsuspendedAccount` helper that gates writes
   on this flag; the helper ships `Library-only` (mirrors WP-053
   `submitCompetitiveScore` / D-10202 precedent) because the
   score-submission HTTP route is itself deferred to a future
   request-handler WP. That future WP becomes the helper's first caller.
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
- A shared intake-check helper (`requireUnsuspendedAccount` under
  `apps/server/src/auth/`) shipped `Library-only`. WP-107 does NOT
  modify any score-submission route — the route itself is deferred per
  api-endpoints.md:193 (WP-053 ships `submitCompetitiveScore`
  Library-only; route wiring belongs to a future request-handler WP
  that owns long-lived `pg.Pool` lifecycle, mirroring WP-102 /
  D-10202). The helper's first caller is that future request-handler
  WP. The HTTP error mapping (`'suspended'` → 403, `'lookup_failed'`
  → 500) is locked here as a caller-contract so the future WP wires
  the helper consistently.

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
- `legendary.competitive_scores` exists per WP-053 (the table is in
  place; `submitCompetitiveScore` ships `Library-only` per
  api-endpoints.md:193 — no HTTP route exists, and WP-107 does NOT
  introduce one).
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
- The shared intake-check helper (`requireUnsuspendedAccount` under
  `apps/server/src/auth/`) ships `Library-only` in this WP. **WP-107
  modifies no score-submission route file** (none exists at HEAD;
  `submitCompetitiveScore` is `Library-only` per api-endpoints.md:193).
  The helper's first caller is a future score-submission
  request-handler WP. The HTTP error mapping locked in §Locked
  contract values is a caller-contract for that future WP, not an
  intake-hook this WP wires.
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
- If WP-159's `requireAdminSession` signature differs from what this WP assumes
  (per §Assumes), STOP — do not modify either WP's contract. Raise the drift.
- The shared helper `requireUnsuspendedAccount` ships `Library-only`. If a
  caller (e.g., an in-flight score-submission request-handler WP) appears
  during execution and proposes wiring the helper, STOP — that wiring belongs
  to that caller's WP, not this one.

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

### G) ~~Score Submission Intake Hook~~ — SCOPED OUT (Option A, pre-flight RS-1 resolution, 2026-05-23)

**Original §G dropped.** The score-submission HTTP route does not exist
at HEAD (`submitCompetitiveScore` is `Library-only` per
api-endpoints.md:193). Wiring the helper into a future request-handler
is that future WP's responsibility. The helper itself still ships under
§D (with the HTTP error mapping locked here as a caller-contract).

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
- Wiring `requireUnsuspendedAccount` into any score-submission HTTP handler — deferred to the future score-submission request-handler WP that introduces the route (WP-053 ships `submitCompetitiveScore` `Library-only` per api-endpoints.md:193 / D-10202; the future WP becomes the helper's first caller)
- Introducing the score-submission HTTP route itself — out of scope on the same deferral grounds
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
- `docs/ai/REFERENCE/api-endpoints.md` — modified — three Wired rows + Library-only row
- `docs/ai/DECISIONS.md` — modified — D-10701, D-10702, D-10703
- `docs/ai/work-packets/WORK_INDEX.md` — modified — mark complete
- `docs/05-ROADMAP-MINDMAP.md` — modified — WP-107 → ✅

11 files (post-Option-A; score-submission route file removed). Above the
recommended 8-file soft cap but within tolerance for a server-side admin
+ migration WP (precedent: EC-117 = 8, EC-112 = 10, EC-174 = 13). §Open
Question 6 LOCK = single WP under Option A. The original WP-107A /
WP-107B split contemplated routing §G to a B-packet; Option A removes
§G entirely, so the split is no longer indicated.

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
- [ ] `requireUnsuspendedAccount(database, accountId)` unit test verifies the closed-union code split (`'suspended'` when row exists with `is_suspended = TRUE`; `'lookup_failed'` when row missing OR DB throws); the future request-handler WP that wires the helper inherits the locked HTTP error mapping (`'suspended'` → 403; `'lookup_failed'` → 500) from this WP's §Locked contract values
- [ ] `legendary.admin_actions` contains zero `UPDATE` or `DELETE` statements across all new files (grep verification)
- [ ] `adminProfile.logic.ts` contains exactly one `BEGIN` site per mutation function; route handlers contain zero `BEGIN` / `COMMIT` / `ROLLBACK` literals
- [ ] Migration 015 applies cleanly AND is idempotent (re-apply succeeds; CHECK + FK constraints survive re-apply)
- [ ] `git diff --name-only apps/server/src/competition/ apps/server/src/leaderboards/ apps/server/src/par/` returns no output (this WP touches no score / leaderboard / PAR surface)
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

# No touch to competition / leaderboards / PAR surface (Option A scope)
git diff --name-only apps/server/src/competition/ apps/server/src/leaderboards/ apps/server/src/par/
# Expected: no output

# Catalog updated
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/admin/players/" 
# Expected: at least 3 matches
```

---

## Open Questions (Resolved 2026-05-23)

All six Open Questions are LOCKED below per pre-flight RS-1 / RS-2
resolution (Option A). Operator may override via SPEC commit + pre-flight
re-run.

1. **Score-submission route filename.** **N/A under Option A.** §G scope-out
   removes the intake-hook from this WP; the route does not exist at HEAD
   and is deferred to a future request-handler WP that owns long-lived
   `pg.Pool` lifecycle.
2. **Suspended-account read visibility.** **LOCK: NO.** Public profile reads
   (`/api/players/:handle/profile`) remain available for suspended accounts.
   Suspension blocks writes only (score submission, profile edits, team
   join). Visibility hiding is a separate moderation WP.
3. **Existing scores from suspended accounts.** **LOCK: STAY.** Historical
   scores remain on leaderboards. Suspension is forward-only. Retroactive
   hiding is a per-record moderation WP.
4. **Team membership when suspended.** **LOCK: NO** auto-leave. Team
   affiliations remain. Team-side display of suspended members is a future
   team-moderation WP.
5. **Audit log retention.** **LOCK: indefinite** for this WP. Retention
   policy is a Phase-7 ops decision, separate WP.
6. **Should WP-107 split into A/B?** **LOCK: single WP.** Option A removes
   §G, dropping the file count to 11 (under the original 12-file split
   threshold). The original WP-107A / WP-107B split contemplated routing
   §G to a B-packet; with §G out entirely, the split is no longer
   indicated.

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

**Date run:** 2026-05-23
**Verdict (initial):** PASS-WITH-FAIL — 36 of 38 Final Gate conditions pass; 2 FAIL surfaced RS items.
**Verdict (after RS-1 Option A resolution, same day):** **PASS.** Both prior FAILs cleared.

| Final Gate # | §  | Condition | Disposition |
|---|---|---|---|
| 6 | §3 | `## Assumes` does not list all file and state dependencies | **Initially FAIL → RS-1; CLEARED by Option A.** Original §Assumes referenced a score-submission HTTP route that does not exist at HEAD. Option A scope-out removed §G and the score-route assumption together; §Assumes now lists only real preconditions, and §Out of Scope explicitly excludes the score-submission route. Per `00.3 §3` ❌ rule the packet can no longer silently produce wrong output. ✅ |
| (none) | §5 | File count > 8 soft cap | **NOT-A-FAIL (advisory).** Post-Option-A file count = 11 — above the ~8 soft cap but within tolerance for a server-side admin + migration WP (precedent: EC-117 = 8, EC-112 = 10, EC-174 = 13). §Open Question 6 LOCK = single WP. ✅ |

**All other gates pass:**

- **§1** All 10 required sections present (Goal, Assumes, Context, Scope In / Out, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done). §Out of Scope explicitly enumerates 11+ excluded items. ✅
- **§2** Non-Negotiable Constraints carries engine-wide block (full file contents, ESM, Node v22+, human-style code referencing `00.6-code-style.md`, pnpm, no axios/node-fetch) + packet-specific block (transaction ownership, audit append-only, score-route hardening, migration shape, reason discipline, locked contracts). Partial output forbidden. ✅
- **§3** Assumes lists every prior WP dep + every file/state precondition. (See FAIL above on the one stale precondition.) ✅ (with RS-1 carve-out)
- **§4** Context (Read First) lists ARCHITECTURE.md, 00.2 §1 + §Competitive Scoring, 00.3 §11/§17/§21, api-endpoints.md, DECISIONS.md scan list, WP-159, adminSession.ts, ownerProfile.routes.ts, ownerProfile.types.ts, migrations 004/008. All specific, no vague references. ✅
- **§5** Files Expected to Change marks each entry — **new** / — **modified** with one-line description. No "show the diff" / "add the following" language. (See advisory above on file count.) ✅
- **§6** Names match `00.2-data-requirements.md`: `accountId`, `handle`, `ext_id`, `legendary.players`, `is_admin`, `is_suspended` all canonical. `AdminPlayerActionType` / `AdminProfileResponse` follow project conventions. ✅
- **§7** No new npm deps introduced. Hanko broker boundary preserved (no `'hanko'` literal in scope). ✅
- **§8** Layer boundary: server-only; no engine / registry / preplan / client imports. `pg` used for DB; no ORM. ✅
- **§9** Windows compatibility: Verification Steps use `Select-String` (PowerShell-native). No bash/sh assumptions. ✅
- **§10** No new env vars introduced. No secrets in WP body. ✅
- **§11** Authentication clarity: `admin-session-required` Auth taxonomy value (per D-15901) explicitly cited; `requireAdminSession` is the sole authorization site. Identity model unambiguous. ✅
- **§12** Tests use `node:test`; no boardgame.io import in test files; injected fake `DatabaseClient` per WP-101 / WP-102 precedent. ✅
- **§13** Verification Steps use `pnpm --filter @legendary-arena/server test`. All grep patterns are exact with expected output. ✅
- **§14** Acceptance Criteria: 19 binary, observable, scope-aligned items (post-tightening; was 12 pre-`daf1e2e`). ✅
- **§15** Definition of Done includes STATUS.md / DECISIONS.md (D-10701..10703) / WORK_INDEX.md / no-files-outside-allowlist check. Also includes 01.5 NOT INVOKED + 01.6 MANDATORY. ✅
- **§16** Code-style alignment: human-style code mandate, `// why:` requirements at 8 specific sites, no `.reduce()` in zone ops (N/A — no zone ops in scope), full-sentence error messages. ✅
- **§17 Vision Alignment** §17.1 triggered (player identity + suspension is competitive integrity surface); §Vision Alignment block present with clauses §3 / §13 / §14 / §22 + no-conflict assertion + NG proximity check + determinism N/A justified. ✅
- **§18 Prose-vs-grep discipline** Verification Steps' grep patterns (`UPDATE legendary.admin_actions`, `BEGIN`/`COMMIT`/`ROLLBACK`) appear in WP body prose but the prose is governance-rationale context, not within the gated grep path (the grep targets `apps/server/src/profile/admin/` / `data/migrations/015_*`, not `docs/ai/`). ✅
- **§19 Bridge-vs-HEAD staleness** N/A — WP-107 is not a repo-state-summarizing artifact. ✅
- **§20 Funding Surface Gate** Explicitly marked N/A with justification: *"WP-107 introduces a backend admin surface with no user-visible funding, donation, or attribution UI."* Not a tautological placeholder. ✅
- **§21 API Catalog Update Obligation** Section present; 3 `Wired` rows + 1 `Library-only` row enumerated per D-11804 replace-whole-row semantics; closed-set taxonomy values (`Wired` / `admin-session-required`) cited correctly. ✅

**Lint Gate Final Verdict (post-Option-A):** **PASS.** All 38 Final Gate conditions pass. Both prior FAILs cleared by the RS-1 Option A scope-out.

---

## Pre-Flight Verdict (initial run 2026-05-23)

**Verdict:** DO NOT EXECUTE YET (NOT READY).
**Blocker:** RS-1 — §G Score-Submission Intake Hook has no route to modify; `submitCompetitiveScore` is `Library-only` and the score-submission HTTP route is deferred to a future request-handler WP per api-endpoints.md:193. Full report: [`docs/ai/invocations/preflight-wp107.md`](../invocations/preflight-wp107.md) (gitignored scratchpad).
**Non-blocking RS items:** RS-2 (§Open Questions Q1–Q6 not yet locked into §Locked contract values; recommended defaults documented in pre-flight scratchpad).
**Copilot check (`01.7`):** SKIPPED per `01.7` sequencing rule.

## Pre-Flight Verdict (re-run 2026-05-23, post-Option-A)

**Verdict:** **READY TO EXECUTE.**

RS-1 resolved via Option A: §G scoped out of WP-107; shared helper `requireUnsuspendedAccount` ships `Library-only`; score-submission intake-hook deferred to the future score-submission request-handler WP. RS-2 resolved: §Open Questions Q1 (N/A), Q2–Q5 (LOCKED to recommended defaults), Q6 (LOCK = single WP) all promoted into §Open Questions and §Files Expected to Change.

**Authorized Next Step:** Generate session execution prompt per `docs/ai/invocations/session-wp107-profile-integrity-anti-cheat-surface.md` (already drafted on 2026-05-23 — needs §Pre-Execution Checks reconciled against Option A scope before session opens).

## Copilot Check Verdict (run 2026-05-23, post-pre-flight READY)

**Verdict:** **PASS.**

All 30 failure modes from `01.7-copilot-check.md` audited against the post-Option-A WP-107 + EC-195 + pre-flight artifact. Key dispositions:

- **#1 Engine/UI boundary drift** — PASS. WP explicitly forbids engine / registry / preplan / client imports; EC §Guardrails enforces.
- **#2 Non-determinism** — PASS. No `Math.random()` / `Date.now()` in scope; only `now()` is DB-server-side `timestamptz DEFAULT`, acceptable for audit.
- **#4 Contract drift** — PASS. EC §Locked Values is a verbatim mirror of WP §Locked contract values. Closed unions for `AdminPlayerActionType` + error codes.
- **#7 Persisting runtime state** — PASS. WP touches no `G` / no engine. DB persistence is intentional (the WP's whole point).
- **#10 Stringly-typed outcomes** — PASS. Closed-union error codes; closed-union action types; DB-level `CHECK` constraints back the unions.
- **#11 Invariant-focused tests** — PASS. EC §Acceptance Criteria includes injected-fault rollback, CHECK/FK rejection, self-action zero-audit-rows, idempotent-re-suspend-still-writes-audit.
- **#12 Scope creep** — PASS. RS-1 + Option A narrowed scope; §Out of Scope expanded with two new explicit exclusions; file count dropped 13 → 11.
- **#13 Unclassified directories** — PASS. `apps/server/src/profile/admin/` inherits the `apps/server/src/profile/` classification (server-layer, profile-namespace, WP-102 / D-10301 precedent); `apps/server/src/auth/requireUnsuspendedAccount.ts` lives under existing classified `auth/` directory.
- **#15 Missing "why"** — PASS. EC §Required `// why:` Comments enumerates 13 sites.
- **#16 Lifecycle wiring creep** — PASS. Only `server.mjs` modified (one line); no `game.ts` / phase / move touches.
- **#17 Hidden mutation via aliasing** — PASS. No `G` involvement; helper returns `Result<void>`.
- **#19 JSON serializability** — PASS. `actionId` explicitly serialized as `string` at JSON boundary (bigserial → string); response shapes are plain objects.
- **#22 Silent vs loud failure** — PASS. Helper returns typed `Result<void>`; rollback on audit failure produces 500.
- **#23 Deterministic ordering** — PASS. `ORDER BY created_at DESC, action_id DESC` tiebreaker locked verbatim.
- **#27 Canonical naming** — PASS. Names match `00.2-data-requirements.md` exactly (`accountId`, `handle`, `ext_id`, `legendary.players`).
- **#28 Upgrade/deprecation story** — PASS. Migration 015 purely additive; CHECK constraint relaxable via `ALTER TABLE` for future action types.
- **#30 Missing pre-session governance fixes** — PASS. RS-1 (pre-flight) + lint FAIL (gate #6 §3) both cleared by Option A scope-out in this same SPEC commit.

All other issues (#3 / #5 / #6 / #8 / #9 / #14 / #18 / #20 / #21 / #24 / #25 / #26 / #29): rapid PASS.

**Pre-Flight Disposition:** **CONFIRM** — pre-flight READY TO EXECUTE verdict stands; session prompt generation authorized.

**Mandatory Governance Follow-ups:** None new. Existing post-execution governance per EC §After Completing already enumerated.

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
