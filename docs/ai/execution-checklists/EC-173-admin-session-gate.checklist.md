# EC-173 — Admin Session Gate (Execution Checklist)

**Source:** docs/ai/work-packets/WP-159-admin-session-gate.md
**Layer:** Server (`apps/server/src/auth/**`) + Database (`data/migrations/014_*`) + Reference (`docs/ai/REFERENCE/api-endpoints.md`)

## Before Starting
- [ ] WP-052 / WP-101 / WP-112 / WP-126 / WP-131 marked `[x]` in WORK_INDEX
- [ ] `apps/server/src/auth/sessionToken.types.ts` exports `SessionTokenRequest`, `RequireAuthenticatedSessionOptions`, `AccountId`, `Result`, `DatabaseClient` (re-export block at lines 244–249)
- [ ] `apps/server/src/auth/sessionToken.logic.ts` exports `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>` with closed-union failure codes per `SessionValidationErrorCode`
- [ ] `apps/server/src/auth/adminGate.ts` (WP-110) present and byte-identical to current `main`
- [ ] `data/migrations/004_create_players_table.sql` defines `legendary.players.ext_id text NOT NULL UNIQUE` (the `AccountId === ext_id` invariant)
- [ ] `pnpm install` && `pnpm -r build` exit 0
- [ ] `pnpm --filter @legendary-arena/server test` baseline = 184 / 0 / 66 / 31 (from Project Baselines post-WP-134)
- [ ] `git diff main -- apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/hanko/ apps/server/src/auth/adminGate.ts` empty

## Locked Values (do not re-derive)
- **File path:** `apps/server/src/auth/adminSession.ts` (single-file isolation; mirrors `adminGate.ts`)
- **Function signature:** `export async function requireAdminSession(request: SessionTokenRequest, options: RequireAuthenticatedSessionOptions): Promise<AdminSessionResult>`
- **Result shape:** `{ readonly ok: true; readonly accountId: AccountId } | { readonly ok: false; readonly code: AdminSessionErrorCode; readonly reason: string }`
- **Closed union:** `AdminSessionErrorCode = 'unauthorized' | 'forbidden' | 'lookup_failed'` (order matters — array mirrors this order)
- **Canonical array:** `ADMIN_SESSION_ERROR_CODES: readonly AdminSessionErrorCode[] = ['unauthorized', 'forbidden', 'lookup_failed'] as const`
- **Identity invariant:** `AccountId === legendary.players.ext_id` — bind `$1 = accountId` directly to `WHERE ext_id = $1`. Any other resolution column INVALIDATES this WP.
- **Import sources (exact paths, no aliases, no barrels):**
  - `SessionTokenRequest`, `RequireAuthenticatedSessionOptions` ← `./sessionToken.types.js`
  - `requireAuthenticatedSession` ← `./sessionToken.logic.js`
  - `AccountId`, `Result`, `DatabaseClient` ← re-export from `./sessionToken.types.js` (never direct from `../identity/identity.types.js`)
- **SQL query (verbatim):** `SELECT is_admin FROM legendary.players WHERE ext_id = $1`
- **Row-count behavior (closed set):** 0 → `lookup_failed`; 1 → evaluate per row-schema check below; ≥2 → `lookup_failed`
- **Row-schema validation (closed set):** the one returned row's `is_admin` field MUST satisfy `typeof row.is_admin === 'boolean'` AND `row.is_admin !== null` AND `row.is_admin !== undefined`. Any failure → `lookup_failed`. Only after this check passes does the `is_admin` evaluation proceed.
- **`is_admin` evaluation (post row-schema):** strict triple-equals (`row.is_admin === true` / `=== false`). Truthy coercion (`if (row.is_admin)`, `Boolean(row.is_admin)`, double-negation `!!row.is_admin`) is FORBIDDEN.
- **Canonical `reason` strings (verbatim — exact-string assertion in tests):**
  - unauthorized: `"Admin session validation failed: upstream session check rejected the request."`
  - forbidden: `"Authenticated account does not have admin privileges."`
  - lookup_failed / zero-row: `"Authenticated account is not present in the players table."`
  - lookup_failed / DB-throw: `"Failed to read admin authorization for the authenticated account."`
  - lookup_failed / multi-row: `"Authenticated account resolves to multiple players rows (data integrity fault)."`
- **Migration filename:** `data/migrations/014_add_is_admin_to_players.sql`
- **Migration body:** `ALTER TABLE legendary.players ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;` + `COMMENT ON COLUMN legendary.players.is_admin IS 'WP-159: admin authorization flag. Default FALSE. Operator-granted via direct SQL. Read exclusively through apps/server/src/auth/adminSession.ts::requireAdminSession.'`
- **API catalog Auth taxonomy addition:** `admin-session-required` (closed-set value, defined as: *"Server-validated Hanko session + `is_admin = TRUE` on the resolved `legendary.players` row. See WP-159 §A."*)
- **Decisions reserved:** D-15901, D-15902

## Guardrails
- **Single source of truth (repo-level invariant).** `adminSession.ts` is the ONLY file in the repo that issues a SELECT against the admin column on `legendary.players`. Repo-wide grep at execution close MUST return zero matches outside `adminSession.{ts,test.ts}` + migration 014. **This invariant applies to all future WPs**; any violation requires (a) a WP update authorizing the new caller AND (b) an explicit `DECISIONS.md` entry documenting the break of seam discipline.
- **Fail-closed at the admin layer.** `{ ok: true; ... }` is reachable ONLY via the §A step-6 branch (one row, `is_admin === true`, strict triple-equals). Any other code path — including malformed DB responses, missing fields, non-boolean values, or paths not enumerated in §A — MUST resolve to a failure result.
- **Row schema validation.** The single returned DB row MUST contain a field named `is_admin`. If the field is missing (`undefined`), `null`, or not strictly boolean (`true` or `false` per `typeof row.is_admin === 'boolean'`), the function MUST return `{ ok: false; code: 'lookup_failed', reason: <canonical DB-throw sentence> }`. This defends against malformed fake `DatabaseClient` rows in tests and any future column-rename drift.
- **SQL shape constraint.** The query MUST be a single-table SELECT against `legendary.players`. No `JOIN`, no `LIMIT`, no `OFFSET`, no `ORDER BY`, no column aliasing (`AS` rename), no `RETURNING` clause. Exactly one column selected (`is_admin`); exactly one `WHERE` predicate (`ext_id = $1`). The returned row's column MUST be accessed as `row.is_admin` (the unaliased column name).
- **`DatabaseClient` interaction (locked).** The query MUST be executed through `options.database.query(...)` (the standardized call surface on the WP-052 `DatabaseClient` interface). No direct `pg.Pool`, no `pool.connect()` + manual release, no alternate driver. The orchestrator's `database` reference flows through unmodified.
- **No mutation of input arguments.** `requireAdminSession` MUST NOT mutate `request`, `options`, `options.verifier`, `options.accountResolver`, or `options.database`. All inputs are treated as immutable. (A test fixture that wraps `options` with `Object.freeze` MUST not cause the helper to throw.)
- **No parallelism, no batching.** The DB read MUST NOT be parallelized with another query, batched, pipelined, or composed with `Promise.all`. Authorization is evaluated in isolation per invocation — one sequential round trip per call.
- **No fallback path.** The helper MUST NOT fall back to any alternative authorization mechanism (shared-secret header, IP allowlist, environment-flag bypass, dev-mode escape hatch, anything). The only valid success path is `requireAuthenticatedSession` success + one-row + `is_admin === true`.
- **No caching, no memoization.** Every `requireAdminSession` call performs a fresh DB read. No `Map`, `WeakMap`, module-level state, or memoize wrapper inside the helper. (Future request-scoped cache would be its own WP with explicit invalidation contract.)
- **No partial success.** Exactly one `AdminSessionResult` per invocation. No `undefined` returns. No thrown exceptions across the helper boundary (DB throws are caught and translated; everything else is a bug).
- **Reason strings are static.** Per `reason` envelope rules in WP-159 §Non-Negotiable Constraints — no dynamic values (timestamps, IDs, header values), no SQL fragments, no stack traces, no error-code leakage. **All `'lookup_failed'` returns use one of exactly three static sentences** (zero-row, DB-throw, multi-row); the canonical strings are in §Locked Values. Tests assert exact-string equality on each.
- **Drift test is bidirectional.** `ADMIN_SESSION_ERROR_CODES` ↔ `AdminSessionErrorCode` Set equality with `arraySet.size === unionSet.size` + forward inclusion + backward inclusion. A one-sided check is FORBIDDEN.
- **Composition over reimplementation.** `requireAdminSession` calls `requireAuthenticatedSession`; it does NOT duplicate token extraction, verifier invocation, or `expiresAt` checking. WP-112's D-11202 (bearer-header only) and D-11204 (fail-closed default) are preserved by construction.
- **Test 8 strictness (no-coercion proof).** Test 8 (truthy non-`true` `is_admin` → `'forbidden'`) MUST include **at least two distinct non-boolean truthy values** — e.g., one of `1`, `"true"`, `"yes"` AND one of `{}`, `[]`, a non-empty Buffer. A single value is insufficient to prove absence of coercion; two distinct shapes confirm the strict triple-equals discipline holds for any non-`true` input.
- **Locked-file boundary.** Zero modifications to `apps/server/src/auth/adminGate.ts`, `sessionToken.logic.ts`, `sessionToken.types.ts`, `hanko/**`, `../identity/identity.types.ts`, or any WP-110 route file. `git diff --stat` against these paths MUST be empty.

## Required `// why:` Comments
- `adminSession.ts` near the SQL query string: explain `AccountId === ext_id` invariant (WP-052 D-5201) and why direct binding is safe
- `adminSession.ts` near the strict-triple-equals check on `is_admin`: explain fail-closed against truthy coercion of non-`true` values (`1`, `"true"`, etc.)
- `adminSession.ts` near the multi-row branch: explain that the branch is logically unreachable under schema constraints (UNIQUE on `ext_id` per migration 004) but still enforced fail-closed; reference the §A control-flow table
- `adminSession.ts` near the upstream-failure branch: explain why upstream `SessionValidationErrorCode` is collapsed to a single `'unauthorized'` value (the admin gate's public error surface is its own three-value closed union — do not leak)
- Migration 014 `COMMENT ON COLUMN` block: explain that schema introspection tools surface the comment, keeping authorization story attached to the data

> **Grep-gate prose discipline (clarified):** the literal token `is_admin`
> MAY appear only in three locations:
> 1. the SQL query string in `adminSession.ts`
> 2. the migration file `data/migrations/014_add_is_admin_to_players.sql`
>    (the ALTER, the COMMENT, and any test-fixture binding inside the file)
> 3. the test file `adminSession.test.ts` (fake-row construction + assertions)
>
> It MUST NOT appear in any other repository file. Prose sections — module
> headers, `// why:` comments outside the three locations above, WP body
> text, this EC's own narrative — MUST paraphrase ("admin authorization
> flag", "the admin column"). The `is_admin` verification grep (see WP-159
> §Verification Steps) enforces this: the gate fails if `is_admin` appears
> anywhere outside `adminSession.{ts,test.ts}` + migration 014.
>
> The literal `ext_id` follows the same rule: SQL query string +
> migration files only; paraphrase elsewhere as "the cross-service identifier"
> or "the ext-id column".
>
> The literal `requireAuthenticatedSession` follows the same rule: appears
> only at the import line and the one call site in `adminSession.ts`,
> plus any explicit test-driver invocation in `adminSession.test.ts`.

## Files to Produce
**New (3):**
- `apps/server/src/auth/adminSession.ts` — `requireAdminSession` helper + closed-union types + canonical array
- `apps/server/src/auth/adminSession.test.ts` — 9 unit tests, injected-fake `DatabaseClient`
- `data/migrations/014_add_is_admin_to_players.sql` — additive `ADD COLUMN IF NOT EXISTS` + `COMMENT ON COLUMN`

**Modified (4):**
- `docs/ai/REFERENCE/api-endpoints.md` — Auth taxonomy + Library-only row per §21 (D-11804 replace-whole-row semantics)
- `docs/ai/DECISIONS.md` — D-15901, D-15902
- `docs/ai/work-packets/WORK_INDEX.md` — flip WP-159 to `[x]`; flip WP-107 from Blocked-on-WP-159 to **Drafted, ready for execution**
- `docs/05-ROADMAP-MINDMAP.md` — add WP-159 to admin cluster; flip WP-107; bump Progress Summary + Last Updated

## After Completing
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` baseline + 9 new tests pass; zero failures, zero unintended skips
- [ ] All §Verification Steps in WP-159 return their expected counts
- [ ] Repo-wide grep for `is_admin` outside `adminSession.{ts,test.ts}` returns zero matches
- [ ] `git diff --stat -- apps/server/src/auth/adminGate.ts apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/hanko/ apps/server/src/identity/identity.types.ts` is empty
- [ ] Migration 014 applies cleanly against dev database; re-running succeeds without error (idempotent)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` Auth taxonomy includes `admin-session-required` AND Library-only row for `requireAdminSession`
- [ ] `docs/ai/STATUS.md` updated with WP-159 completion note
- [ ] `docs/ai/DECISIONS.md` updated with D-15901 + D-15902 (both with full Rationale + Alternatives Rejected per WP §Decisions)
- [ ] WORK_INDEX.md: WP-159 `[x]`; WP-107 line updated to **Drafted, ready for execution** (no longer Blocked)
- [ ] Roadmap mindmap: new admin cluster reflects WP-159 ✅; WP-107 status flipped; Progress Summary `+1 done`
- [ ] Commit message body declares `01.5 NOT INVOKED`
- [ ] 01.6 post-mortem authored (new long-lived abstraction: `requireAdminSession` is the canonical admin-authorization seam for every future admin-only route)

## Common Failure Smells
- **"All tests pass but a follow-up route accepts non-admin sessions"** → the route bypassed `requireAdminSession` and queried `is_admin` directly. Re-run the repo-wide grep gate; the seam is the helper, not the column.
- **Drift test passes locally but lint flags it** → drift test is one-sided (only forward inclusion). Replace with the Set-equality + `arraySet.size === unionSet.size` shape from WP-159 §B test 9.
- **`reason` strings mutate between calls** → reason was assembled with template literals including dynamic data (account ID, timestamp). Per the envelope rule, every failure code maps to exactly one static sentence; tests assert exact-string equality.
- **Truthy-coercion bug** (`if (row.is_admin)` against `is_admin = 1` from a non-Postgres test fake) — if the row-schema typeof check is also missing, the helper silently returns `ok: true`; if the typeof check is present but the coercion shape leaks into a different branch, the helper returns `'forbidden'` instead of `'lookup_failed'`. Grep for `if (row.is_admin)` / `Boolean(row.is_admin)` / `!!row.is_admin` MUST return zero matches. Test 8 (two distinct non-boolean truthy shapes, expected `'lookup_failed'`) detects both failure modes.
- **Migration 014 fails on second apply** → missing `IF NOT EXISTS` guard on `ADD COLUMN`. Mirror migration 008's idempotency pattern.
- **`adminGate.ts` accidentally modified** → file was edited to add the new helper instead of creating a sibling. WP-159 §Scope: the new code lives in `adminSession.ts`; `adminGate.ts` is byte-identical pre/post.
- **`SessionOptions` import shows up in PR diff** → type was aliased on import. Per locked import sources, the exact type name `RequireAuthenticatedSessionOptions` is preserved.
- **Catalog row says `Wired` for `requireAdminSession`** → wrong row class. `requireAdminSession` is a library helper, not an HTTP endpoint; its row belongs in the Library-only block, not the Wired block. The Auth taxonomy entry is the only new closed-set value.
