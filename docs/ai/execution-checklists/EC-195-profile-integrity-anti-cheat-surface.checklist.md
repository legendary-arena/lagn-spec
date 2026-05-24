# EC-195 — Profile Integrity / Anti-Cheat Surface (Execution Checklist)

**Source:** docs/ai/work-packets/WP-107-profile-integrity-anti-cheat-surface.md
**Layer:** Server (`apps/server/src/profile/admin/**` + `apps/server/src/auth/**`) + Database (`data/migrations/015_*`) + Reference (`docs/ai/REFERENCE/api-endpoints.md`)

> *Slot retargeted from EC-107 to EC-195 — EC-107 occupied by `EC-107-keyword-rule-glossary-schema-and-labels.checklist.md`. Follows EC-117 retarget precedent.*

**Execution Authority:** This EC is the authoritative execution checklist for WP-107. Implementation must satisfy every clause exactly. If EC and WP conflict on design, **WP-107 wins**.

**Readiness:** WP-159 (the structural blocker) shipped 2026-05-17 (commit `295eec6` / PR #85). EC-195 status remains **Draft** pending Phase 1 close-out gates (pre-flight `01.4`, copilot check `01.7`, lint gate `00.3` self-review on the WP body) AND §Before Starting all-green AND WP-107 §Open Questions 1–6 resolved and locked into WP-107 §Locked contract values.

## Before Starting (STOP / GO Gate)
- [ ] WP-159 confirmed merged on `main` (shipped 2026-05-17, commit `295eec6` / PR #85); re-verify at session start: `apps/server/src/auth/adminSession.ts` exists with the locked `requireAdminSession(request, options): Promise<AdminSessionResult>` signature; `is_admin BOOLEAN` present on `legendary.players` via migration 014; `admin-session-required` present in `docs/ai/REFERENCE/api-endpoints.md` Auth taxonomy
- [ ] WP-052 / WP-101 / WP-102 / WP-104 / WP-112 / WP-126 / WP-131 / WP-053 merged on `main`; their contract files unchanged at HEAD (`git diff main`)
- [ ] WP-107 §Open Questions 1–6 resolved and locked — especially Q1 (score-submission route filename, identified by `Select-String -Path apps\server\src\score -Pattern requireAuthenticatedSession -Recurse`) and Q6 (single-WP vs split into WP-107A / WP-107B)
- [ ] `legendary.players.handle` (WP-101 migration 008) + `legendary.competitive_scores` (WP-053 migration 007) present in `data/migrations/`
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0 (baseline test counts captured)
- [ ] `git diff --name-only apps/server/src/profile/admin/ apps/server/src/auth/requireUnsuspendedAccount.ts data/migrations/015_*` empty at start

## Locked Values (do not re-derive)
- Admin route prefix: `/api/admin/players/` — URL parameter is `:handle` (NOT `:accountId`); handle → `AccountId` resolved server-side via WP-101 `findAccountByHandle`
- Three new endpoints, all `admin-session-required`: `GET /api/admin/players/:handle/integrity`, `POST /api/admin/players/:handle/suspend`, `POST /api/admin/players/:handle/unsuspend`
- Suspension column: `is_suspended BOOLEAN NOT NULL DEFAULT FALSE` on `legendary.players`
- Suspension `UPDATE` shape (verbatim, unconditional, NOT read-modify-write): `UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2;`
- Audit table `legendary.admin_actions` (verbatim columns + constraints):
  - `action_id bigserial PRIMARY KEY`
  - `acting_account_id text NOT NULL REFERENCES legendary.players(ext_id) ON DELETE RESTRICT`
  - `target_account_id text NOT NULL REFERENCES legendary.players(ext_id) ON DELETE RESTRICT`
  - `action_type text NOT NULL CHECK (action_type IN ('suspend', 'unsuspend'))`
  - `reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500)`
  - `created_at timestamptz NOT NULL DEFAULT now()`
- Audit-log index: `admin_actions_target_idx ON legendary.admin_actions (target_account_id, created_at DESC, action_id DESC)`
- Audit-log query `ORDER BY` (verbatim): `ORDER BY created_at DESC, action_id DESC`
- Closed union `AdminPlayerActionType = 'suspend' | 'unsuspend'`
- Closed-union error codes: `'unauthorized' | 'forbidden' | 'not_found' | 'invalid_request' | 'internal_error'`
- `AdminProfileResponse` exact shape: `{ accountId: AccountId; handle: string; isSuspended: boolean; recentAuditLog: AuditLogEntry[] }` (4 fields; admin-only — public/owner composition is reached via WP-102 / WP-104 endpoints)
- `AuditLogEntry` exact shape: `{ actionId: string; actingAccountId: AccountId; actionType: AdminPlayerActionType; reason: string; createdAt: string /* ISO-8601 */ }`
- `AdminActionRequest` exact shape: `{ reason: string }` (1–500 chars after `trim()`)
- `AdminActionResponse` exact shape: `{ ok: true; actionId: string }`
- `requireUnsuspendedAccount` → HTTP error mapping (verbatim): `'suspended'` → HTTP 403 `{ code: 'forbidden', reason: 'Account is suspended.' }`; `'lookup_failed'` → HTTP 500 `{ code: 'internal_error' }`
- Self-suspension forbidden: `actingAccountId === targetAccountId` (after handle → `ext_id` resolution) → 400 `{ code: 'invalid_request', reason: 'Admins cannot suspend their own account.' }`. Applies to BOTH `POST /suspend` and `POST /unsuspend`. Zero audit rows written.
- Reason normalization: `reason.trim()` before validation; trimmed length `≥ 1` AND `≤ 500`; whitespace-only rejected; trimmed value stored verbatim
- Shared intake helper: `requireUnsuspendedAccount(database, accountId): Result<void>` with codes `'suspended' | 'lookup_failed'` — lives under `apps/server/src/auth/`, NOT `apps/server/src/profile/admin/`
- Audit-log tail bound: `LIMIT 100` on `GET /api/admin/players/:handle/integrity`
- Migration filename: `data/migrations/015_add_player_suspension_and_admin_actions.sql`
- Catalog update (per §21 + D-11804): 3 `Wired` rows + 1 `Library-only` row (`requireUnsuspendedAccount`); replace-whole-row semantics
- D-NNNNN reserved (landed at execution close): D-10701 (account-level scope), D-10702 (audit log append-only single-table), D-10703 (handle in URL, not accountId)

## Guardrails
- `requireAdminSession(request, options)` is the **first** action in every admin route handler — no route decides authorization inline
- **Transaction ownership lives in the logic layer**: `adminProfile.logic.ts` is the only file that emits `BEGIN` / `COMMIT` / `ROLLBACK` literals. Route handlers contain zero transaction-control statements. Logic functions accept a `DatabaseClient` that supports transaction scoping (no implicit autocommit).
- Every successful admin mutation executes as the exact sequence `BEGIN → UPDATE legendary.players → INSERT legendary.admin_actions → COMMIT`; the audit `INSERT` completes BEFORE `COMMIT`; any step failure → `ROLLBACK` + 500 `{ code: 'internal_error' }`. No fire-and-forget audit writes.
- Suspension `UPDATE` is unconditional set, NOT read-modify-write: `UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2;` — concurrent duplicate updates are acceptable; idempotency is DB-enforced
- `GET /integrity` composes profile-state + audit-log reads from a **single transaction at `REPEATABLE READ`** OR a single JOINed `SELECT` — never multi-connection composition
- `legendary.admin_actions` is **append-only**: zero `UPDATE legendary.admin_actions` / `DELETE FROM legendary.admin_actions` statements across all new files (grep-verified)
- DB-level enforcement: `CHECK (action_type IN ('suspend', 'unsuspend'))`, `CHECK (length(reason) BETWEEN 1 AND 500)`, `FOREIGN KEY` to `legendary.players(ext_id)` on both account-id columns — present in migration 015
- Self-action forbidden: both `POST /suspend` and `POST /unsuspend` reject `actingAccountId === targetAccountId` with 400 + zero audit rows
- Reason discipline: `.trim()` applied before validation; trimmed length ∈ [1, 500]; trimmed value stored in audit row
- Score-submission intake check lives **only** inside `requireUnsuspendedAccount`; WP-053's route gains exactly **one import line + one early-return guard** (≤ 6 lines `git diff --stat`); no new imports beyond `requireUnsuspendedAccount`; no other error-code paths altered
- Migration 015 is purely additive (one `ALTER TABLE … ADD COLUMN IF NOT EXISTS` + one `CREATE TABLE IF NOT EXISTS` + one `CREATE INDEX IF NOT EXISTS`) AND idempotent — zero `DROP` / `TRUNCATE`
- Re-suspending an already-suspended account is a no-op on `is_suspended` (column update is still issued unconditionally) but **DOES** write one audit row (idempotent at column, observable at log)
- MUST NOT modify: `apps/server/src/auth/adminSession.ts`, `apps/server/src/auth/adminGate.ts`, `apps/server/src/auth/sessionToken.{logic,types}.ts`, `apps/server/src/auth/hanko/**`, any leaderboard / score-computation / PAR logic, engine / registry / preplan / client packages
- No `boardgame.io` / `@legendary-arena/game-engine` / `@legendary-arena/registry` / `@legendary-arena/preplan` import in any WP-107 file
- File-count discipline: if final count exceeds 12, STOP and apply WP-107 §Open Question 6 split (WP-107A gate+audit+admin / WP-107B intake hook)

## Required `// why:` Comments
- `adminProfile.logic.ts` mutation sites: the transaction lives in the logic layer (not the route) so the audit `INSERT` and the column `UPDATE` share atomicity; a failed audit rolls back the suspension (Vision §22 auditability invariant)
- `adminProfile.logic.ts` unconditional `UPDATE`: the statement sets `is_suspended` without a prior `SELECT`; concurrent admin actions producing duplicate writes are safe and expected — idempotency is DB-enforced, not application-enforced
- `adminProfile.logic.ts` idempotent re-suspend: the column update is a no-op when already `TRUE`, but the audit row is **still written** to capture admin intent + reason
- `adminProfile.logic.ts` `GET /integrity` snapshot: profile + audit-log reads share one `BEGIN…COMMIT` at `REPEATABLE READ` (or one JOINed `SELECT`) so the response cannot show stale suspension state alongside fresh audit rows
- `adminProfile.logic.ts` audit-log `ORDER BY created_at DESC, action_id DESC`: `action_id` is the deterministic tiebreaker when two audit rows share `created_at` to the millisecond
- `adminProfile.routes.ts` per-route handler: `requireAdminSession` is invoked first because no inline `is_admin` check is permitted (per WP-159 contract)
- `adminProfile.routes.ts` self-action guard: `actingAccountId === targetAccountId` is rejected to prevent accidental admin lockout; the check is at the route layer so zero DB work happens for self-action attempts
- `adminProfile.logic.ts` `LIMIT 100` on integrity tail: the surface is read-mostly; a full-history endpoint is deferred to a later moderation WP
- `requireUnsuspendedAccount.ts` placement: helper lives under `auth/` (not `profile/admin/`) because the score-submission intake is broker-agnostic and reusable; profile-admin-owned would invert the dependency direction
- `requireUnsuspendedAccount.ts` result-code split: `'suspended'` (row exists, `is_suspended = TRUE`) is distinct from `'lookup_failed'` (DB error or row missing) so the score-submission route can map each to a different HTTP status (403 vs 500)
- Migration 015 `CHECK` + `FOREIGN KEY` constraints: DB-level enforcement of the closed `AdminPlayerActionType` union and of audit-row referential integrity; application-layer validation is defense-in-depth, not the authoritative gate
- Migration 015 `IF NOT EXISTS` clauses: idempotency required so re-apply over a partially-applied state succeeds without manual cleanup
- Score-submission route guard: positioned **after** the existing session-validation step and **before** any DB write (a suspended-account row insert would be an observable side effect)
- Route layer `reason.trim()` site: trimming happens before the length-bound validation so whitespace-only reasons are caught at the application boundary; the DB `CHECK (length(reason) BETWEEN 1 AND 500)` constraint is defense-in-depth against bypass

## Files to Produce
- `data/migrations/015_add_player_suspension_and_admin_actions.sql` — **new** — `ALTER TABLE` + `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
- `apps/server/src/profile/admin/adminProfile.types.ts` — **new** — closed-union codes, `AdminProfileResponse`, `AdminActionRequest`, `AdminActionResponse`, `AuditLogEntry`
- `apps/server/src/profile/admin/adminProfile.logic.ts` — **new** — `getAdminProfileView`, `suspendPlayer`, `unsuspendPlayer`, `getAdminActionsForPlayer`
- `apps/server/src/profile/admin/adminProfile.logic.test.ts` — **new** — unit tests with injected fake `DatabaseClient`
- `apps/server/src/profile/admin/adminProfile.routes.ts` — **new** — `registerAdminProfileRoutes(router, database)` (3 routes; each gated by `requireAdminSession` as the first handler action)
- `apps/server/src/profile/admin/adminProfile.routes.test.ts` — **new** — route tests covering 200 / 400 / 401 / 403 / 404
- `apps/server/src/auth/requireUnsuspendedAccount.ts` — **new** — shared intake helper returning `Result<void>` with closed-union code `'suspended' | 'lookup_failed'`
- `apps/server/src/auth/requireUnsuspendedAccount.test.ts` — **new**
- `apps/server/src/server.mjs` — **modified** — one-line `registerAdminProfileRoutes(server.router, pool)` after the existing `registerAdminBillingRoutes` call
- `apps/server/src/score/<score submission route — locked per WP-107 §Open Question 1>` — **modified** — exactly one import + one early-return guard (`≤ 6` lines diff)
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — 3 `Wired` rows + 1 `Library-only` row per §21 (replace-whole-row per D-11804)
- `docs/ai/DECISIONS.md` — **modified** — D-10701, D-10702, D-10703 landed verbatim
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-107 row `[ ]` → `[x]` with date + commit SHA
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — Phase 9 row (3/4 → 4/4); WP-107 Drafted → ✅
- Plus governance: `docs/ai/STATUS.md`, `docs/ai/execution-checklists/EC_INDEX.md`

## After Completing
- [ ] All WP-107 §Acceptance Criteria + §Verification Steps pass
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0
- [ ] `git diff --name-only apps/server/src/auth/adminSession.ts apps/server/src/auth/adminGate.ts apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/hanko/` returns no output (locked contracts untouched)
- [ ] `git diff --stat -- apps/server/src/score/` shows exactly one file changed, ≤ 6 lines
- [ ] D-10701, D-10702, D-10703 written verbatim into `DECISIONS.md`
- [ ] `STATUS.md` carries `### WP-107 / EC-195 Executed` block at top of `## Current State`
- [ ] `WORK_INDEX.md` WP-107 `[x]` with date + commit SHA; `EC_INDEX.md` EC-195 `Draft` → `Done {YYYY-MM-DD}`
- [ ] `docs/05-ROADMAP-MINDMAP.md` Phase 9 row updated (3/4 → 4/4)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries 3 new `Wired` rows + 1 new `Library-only` row per §21
- [ ] 01.5 NOT INVOKED (no engine surface)
- [ ] **01.6 post-mortem MANDATORY** (first admin-mutation surface; audit-log primitive becomes a new code category)
- [ ] Commit prefix `EC-195:` (code under `apps/server/src/` is staged → `SPEC:` prefix forbidden per `01.3` Rule 5); Vision trailer `Vision: §3, §13, §14, §22`

## Common Failure Smells
- Admin route does an inline `is_admin` check (e.g., `if (account.is_admin) …`) instead of calling `requireAdminSession` first → guardrail violated; rewrite so `requireAdminSession(req, options)` is the first statement in the handler and `Result.fail` short-circuits the route
- `BEGIN` / `COMMIT` / `ROLLBACK` appears in `adminProfile.routes.ts` → transaction ownership leaked to the route layer; move the transaction into `adminProfile.logic.ts` and have the route pass a `DatabaseClient` in
- Suspension `UPDATE` preceded by a `SELECT … FOR UPDATE` or any read-modify-write pattern → race-safety contract violated; rewrite as a single unconditional `UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2`
- Audit row written via a separate connection / after `res.status(200)` / fire-and-forget → transaction-ordering violated; the audit `INSERT` must share the mutation's transaction and complete before `COMMIT`
- `GET /integrity` issues separate `SELECT` calls for profile + audit log without sharing a transaction or isolation snapshot → consistency contract violated; wrap in `BEGIN ISOLATION LEVEL REPEATABLE READ … COMMIT` or rewrite as a single JOINed `SELECT`
- `UPDATE legendary.admin_actions` or `DELETE FROM legendary.admin_actions` appears anywhere → append-only contract violated; redesign rather than relax the gate
- Migration 015 ships `action_type text NOT NULL` without the `CHECK (action_type IN (...))` clause OR the FK constraints OR the `length(reason) BETWEEN 1 AND 500` check → DB-level enforcement skipped; locked migration shape requires all three
- An admin can suspend their own account (no self-action guard) → policy gap; add `actingAccountId === targetAccountId` rejection to both mutation routes
- Score-submission route diff exceeds 6 lines, adds an import other than `requireUnsuspendedAccount`, or changes any existing error-code path → §Scope drift; revert and apply only the two-line pattern
- `requireUnsuspendedAccount.ts` lives under `apps/server/src/profile/admin/` → layout inverts the dependency direction (score submission would import from profile-admin); the helper belongs under `auth/`
- Whitespace-only `reason` accepted (e.g., `reason.length > 0` without `.trim()`) → Vision §22 violated; the audit log is meaningless without a real reason
- `reason` of >500 chars accepted at the route → length-cap contract violated; the DB `CHECK` will reject it but the 400 should fire at the application boundary first
- Re-suspending a suspended account returns 200 with no audit row written (caller short-circuits on `is_suspended === TRUE`) → idempotency-at-log contract violated; the column update is the no-op, not the audit write
- Audit-log `ORDER BY created_at DESC` without the `action_id DESC` tiebreaker → ordering is non-deterministic at same-timestamp collisions; add the tiebreaker
- `AdminProfileResponse` body carries extra fields (display name, badges, replays, etc.) → response-shape lock violated; the 4-field surface is admin-only by design — fuller composition belongs to a later WP
- `requireUnsuspendedAccount` returns `'lookup_failed'` and the score-submission route maps it to 403 instead of 500 → error-mapping contract violated; `'suspended'` → 403, `'lookup_failed'` → 500
- Migration 015 contains `DROP` / `TRUNCATE` / a non-`IF NOT EXISTS` statement → re-apply breaks; rewrite as additive only
- FK constraint targets `legendary.players(account_id)` instead of `legendary.players(ext_id)` → wrong PK reference; the AccountId-bearing column is `ext_id` per migration 004
- `apps/server/src/auth/adminSession.ts` appears in `git diff` → WP-159 contract touched; revert immediately and raise drift with the operator
- `'admin-session-required'` value missing from the new catalog rows OR the `Library-only` row missing for `requireUnsuspendedAccount` → §21 catalog obligation violated
