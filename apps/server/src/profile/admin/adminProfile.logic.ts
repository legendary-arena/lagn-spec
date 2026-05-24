/**
 * Admin Profile Logic — Server Layer (WP-107)
 *
 * Public functions for the admin-only profile integrity surface.
 * `getAdminProfileView` composes the integrity read view from a single
 * snapshot (one `BEGIN ISOLATION LEVEL REPEATABLE READ` transaction
 * covering the profile + audit-log queries). `suspendPlayer` /
 * `unsuspendPlayer` apply the suspension flag and write the audit row
 * inside one transaction
 * (`BEGIN -> UPDATE legendary.players -> INSERT legendary.admin_actions -> COMMIT`),
 * rolling back on any failure. `getAdminActionsForPlayer` is a
 * read-only helper consumed by `getAdminProfileView`.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only through
 * the supplied `DatabaseClient` parameter (a `pg.Pool` alias per the
 * identity layer).
 *
 * Transaction ownership invariant: every `BEGIN` / `COMMIT` /
 * `ROLLBACK` literal in WP-107 lives in this file. Route handlers
 * (`adminProfile.routes.ts`) pass a `DatabaseClient` in; they never
 * begin transactions themselves. Audit-log writes are NEVER
 * fire-and-forget — the `INSERT` completes BEFORE `COMMIT` on every
 * successful path.
 *
 * Append-only invariant: this file issues exactly one mutation
 * statement against `legendary.admin_actions` — the INSERT inside the
 * suspend/unsuspend transactional envelope. No mutate-after-insert
 * paths exist for that table anywhere in scope; the audit log is
 * structurally append-only and the DB-level `CHECK` + FK constraints
 * in migration 015 back the application-layer discipline as
 * defense-in-depth.
 *
 * Lifecycle prohibition: the four exported functions
 * (`getAdminProfileView`, `suspendPlayer`, `unsuspendPlayer`,
 * `getAdminActionsForPlayer`, plus the route adapter in
 * `adminProfile.routes.ts`) MUST NOT be called from `game.ts`, any
 * `LegendaryGame.moves` entry, any phase hook, any file under
 * `packages/`, any file under `apps/replay-producer/` or
 * `apps/registry-viewer/`, or any file under
 * `apps/server/src/{identity,replay,competition,par,rules,game}/`.
 * They are consumed only by `adminProfile.logic.test.ts`, by
 * `adminProfile.routes.ts`, and by `apps/server/src/server.mjs`
 * (one-line registration call per the WP-104 / D-10408 precedent).
 *
 * Authority: WP-107 §Locked contract values + §Non-Negotiable
 * Constraints; EC-195 §Locked Values + §Guardrails; D-10701 (account-
 * level scope); D-10702 (audit log append-only single-table);
 * D-10703 (handle in URL, not accountId); WP-104 / EC-128
 * `replaceOwnerLinks` transaction-envelope precedent.
 */

import type {
  AccountId,
  DatabaseClient,
} from '../../identity/identity.types.js';
import type {
  AdminPlayerActionType,
  AdminProfileResponse,
  AdminProfileResult,
  AuditLogEntry,
  MutationSuccess,
} from './adminProfile.types.js';

/**
 * Locked audit-log query tail bound for `GET /integrity`. Read-mostly
 * surface; a full-history endpoint is deferred to a later moderation
 * WP per WP-107 §Locked contract values.
 */
const AUDIT_LOG_TAIL_LIMIT = 100;

/**
 * Locked reason-length cap matching the DB `CHECK (length(reason)
 * BETWEEN 1 AND 500)` constraint in migration 015. The application
 * layer validates against this constant first; the DB CHECK is
 * defense-in-depth.
 */
const MAX_REASON_LENGTH = 500;

/**
 * Locked minimum reason length (post-trim). Whitespace-only reasons
 * trim to length 0 and are rejected before any DB call fires.
 */
const MIN_REASON_LENGTH = 1;

interface AdminActionRow {
  action_id: string | number;
  acting_account_id: string;
  action_type: string;
  reason: string;
  created_at: Date | string;
}

interface PlayerIntegrityRow {
  ext_id: string;
  handle_canonical: string | null;
  display_handle: string | null;
  is_suspended: boolean;
}

/**
 * Map a `legendary.admin_actions` row to the locked `AuditLogEntry`
 * wire shape. Coerces `action_id` from `pg`'s bigserial representation
 * (string by default) to the JSON-boundary `string` shape, and narrows
 * `action_type` against the closed-union allowlist defensively (the SQL
 * CHECK constraint in migration 015 enforces the same allowlist; this
 * is defense-in-depth).
 */
function mapAdminActionRow(row: AdminActionRow): AuditLogEntry {
  const createdAtIso =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at;
  // why: the action_type value comes from a CHECK-constrained column,
  // so it is safe to narrow against the closed union; the cast is a
  // runtime assertion the SQL constraint already proved at row-write
  // time. acting_account_id similarly comes from a FK-constrained
  // column on legendary.players(ext_id), so the AccountId brand-cast
  // is safe by construction.
  return {
    actionId: String(row.action_id),
    actingAccountId: row.acting_account_id as AccountId,
    actionType: row.action_type as AdminPlayerActionType,
    reason: row.reason,
    createdAt: createdAtIso,
  };
}

/**
 * Read up to `LIMIT 100` recent audit-log rows for a target player,
 * ordered by `created_at DESC, action_id DESC` (deterministic
 * tiebreaker on same-millisecond `created_at` collisions per WP-107
 * §Locked contract values). Pure read — no mutation. The `client`
 * argument is the `DatabaseClient` OR a transaction-scoped pool client
 * (the helper does not own transaction lifecycle).
 *
 * Exported for testability and for `adminProfile.routes.ts` should a
 * future moderation WP add a paginated full-history endpoint that
 * reuses this query shape.
 */
export async function getAdminActionsForPlayer(
  database: DatabaseClient,
  targetAccountId: AccountId,
  limit: number = AUDIT_LOG_TAIL_LIMIT,
): Promise<AuditLogEntry[]> {
  // why: ORDER BY created_at DESC, action_id DESC — the action_id
  // tiebreaker resolves same-millisecond created_at collisions
  // deterministically (bigserial PRIMARY KEY guarantees monotonic
  // ordering within a single connection's insertion sequence). The
  // composite index admin_actions_target_idx on (target_account_id,
  // created_at DESC, action_id DESC) supports this query with a single
  // index scan.
  const queryResult = await database.query(
    'SELECT action_id, acting_account_id, action_type, reason, created_at ' +
      'FROM legendary.admin_actions ' +
      'WHERE target_account_id = $1 ' +
      'ORDER BY created_at DESC, action_id DESC ' +
      'LIMIT $2',
    [targetAccountId, limit],
  );
  const entries: AuditLogEntry[] = [];
  for (const row of queryResult.rows as AdminActionRow[]) {
    entries.push(mapAdminActionRow(row));
  }
  return entries;
}

/**
 * Resolve a canonical handle to the admin-integrity view of the
 * corresponding `legendary.players` row + the LIMIT-100 audit-log
 * tail. Returns `Result.fail({ code: 'not_found' })` when no row
 * matches the handle.
 *
 * **Consistency invariant**: profile-state and audit-log reads share a
 * single `BEGIN ISOLATION LEVEL REPEATABLE READ ... COMMIT`
 * transaction so the response cannot show stale suspension state
 * alongside fresh audit rows. This is the per WP-107 §Locked contract
 * values "GET /api/admin/players/:handle/integrity MUST compose its
 * response from a single SQL transaction (one BEGIN/COMMIT pair at
 * isolation level REPEATABLE READ) OR from a single JOINed SELECT, so
 * the profile-state read and the audit-log tail read see the same
 * snapshot" requirement.
 */
export async function getAdminProfileView(
  database: DatabaseClient,
  canonicalHandle: string,
): Promise<AdminProfileResult<AdminProfileResponse>> {
  const canonical = canonicalHandle.trim().toLowerCase();
  // why: profile + audit-log reads share one BEGIN...COMMIT at
  // REPEATABLE READ so the response cannot show stale suspension state
  // alongside fresh audit rows. A concurrent suspend / unsuspend that
  // commits between the two SELECTs (under READ COMMITTED) would
  // produce a view where is_suspended=true but the most recent audit
  // row is "unsuspend" (or vice versa); REPEATABLE READ pins both
  // reads to the same MVCC snapshot.
  const client = await database.connect();
  let transactionError: unknown = null;
  let profileRow: PlayerIntegrityRow | null = null;
  let auditEntries: AuditLogEntry[] = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const profileResult = await client.query(
      'SELECT ext_id, handle_canonical, display_handle, is_suspended ' +
        'FROM legendary.players ' +
        'WHERE handle_canonical = $1 LIMIT 1',
      [canonical],
    );
    if (profileResult.rows.length > 0) {
      profileRow = profileResult.rows[0] as PlayerIntegrityRow;
      // why: ORDER BY created_at DESC, action_id DESC — the action_id
      // tiebreaker resolves same-millisecond created_at collisions
      // deterministically. Inlined inside the transaction (rather than
      // calling getAdminActionsForPlayer) so the audit-log SELECT
      // shares the same MVCC snapshot as the profile SELECT above.
      const auditResult = await client.query(
        'SELECT action_id, acting_account_id, action_type, reason, created_at ' +
          'FROM legendary.admin_actions ' +
          'WHERE target_account_id = $1 ' +
          'ORDER BY created_at DESC, action_id DESC ' +
          'LIMIT $2',
        [profileRow.ext_id, AUDIT_LOG_TAIL_LIMIT],
      );
      for (const row of auditResult.rows as AdminActionRow[]) {
        auditEntries.push(mapAdminActionRow(row));
      }
    }
    await client.query('COMMIT');
  } catch (caughtError) {
    transactionError = caughtError;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      void rollbackError;
    }
  }
  client.release();
  if (transactionError !== null) {
    return {
      ok: false,
      reason:
        'Failed to read admin profile integrity view from the database; transaction was rolled back.',
      code: 'internal_error',
    };
  }
  if (profileRow === null) {
    return {
      ok: false,
      reason: `No legendary.players row matches the supplied handle "${canonical}".`,
      code: 'not_found',
    };
  }
  const accountId = profileRow.ext_id as AccountId;
  // why: handle_canonical can be NULL when the account has not yet
  // claimed a handle (per WP-101). In practice the route reaches this
  // branch only when handle_canonical = $1 matched a row, so the
  // column is non-null by construction; the defensive `?? canonical`
  // fallback keeps the type signature honest without introducing a
  // separate null-handle code path that cannot fire.
  return {
    ok: true,
    value: {
      accountId,
      handle: profileRow.handle_canonical ?? canonical,
      isSuspended: profileRow.is_suspended,
      recentAuditLog: auditEntries,
    },
  };
}

/**
 * Validate the trimmed reason against the locked 1-500 character cap
 * (`MIN_REASON_LENGTH` <= length <= `MAX_REASON_LENGTH`). Pure
 * validator; returns the trimmed value on success or a typed
 * `Result.fail` on failure. Whitespace-only reasons trim to length 0
 * and are rejected here, before any DB call fires; the DB CHECK is
 * defense-in-depth.
 */
function validateReason(rawReason: unknown): AdminProfileResult<string> {
  if (typeof rawReason !== 'string') {
    return {
      ok: false,
      reason:
        'Field "reason" must be a string; received non-string or missing value.',
      code: 'invalid_request',
    };
  }
  // why: trim BEFORE the length check so whitespace-only reasons fail
  // the 1-500 cap rather than the typeof guard above. The trimmed
  // value is what we store in the audit row; the DB CHECK
  // (length(reason) BETWEEN 1 AND 500) is defense-in-depth against
  // any future caller that bypasses this validator.
  const trimmed = rawReason.trim();
  if (trimmed.length < MIN_REASON_LENGTH) {
    return {
      ok: false,
      reason:
        'Field "reason" must contain at least one non-whitespace character after trimming.',
      code: 'invalid_request',
    };
  }
  if (trimmed.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      reason: `Field "reason" must be ${MAX_REASON_LENGTH} characters or fewer after trimming; received longer value.`,
      code: 'invalid_request',
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Apply a suspension state change to `legendary.players` and append
 * one audit row to `legendary.admin_actions`, inside a single
 * transaction. The `actionType` parameter selects the semantic action
 * (`'suspend'` -> `is_suspended = TRUE`; `'unsuspend'` -> `FALSE`);
 * the same transactional envelope is used for both so the audit-log
 * invariant ("every successful mutation writes exactly one audit row
 * inside the same transaction as the column update") holds for either
 * direction.
 *
 * **Transaction shape (LOCKED, per WP-107 §Locked contract values)**:
 *
 *   BEGIN
 *     UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2
 *     INSERT INTO legendary.admin_actions (...) VALUES (...)
 *       RETURNING action_id
 *   COMMIT
 *
 * If any step fails, the transaction is `ROLLBACK`'d and the function
 * returns `Result.fail({ code: 'internal_error' })`. The audit
 * `INSERT` completes BEFORE `COMMIT`; there are no fire-and-forget
 * audit writes anywhere in this file.
 *
 * **Race-safety lock**: the column update is the unconditional
 * `UPDATE ... SET is_suspended = $1 WHERE ext_id = $2` — NOT a
 * read-modify-write. Concurrent admin actions producing duplicate
 * writes are acceptable and expected; idempotency at the column is
 * DB-enforced (the assignment is identity when the column already
 * holds the target value). The audit row is still written on the
 * re-suspend / re-unsuspend path so admin intent + reason are
 * captured (idempotent at column, observable at log).
 *
 * **Self-action policy**: this function does NOT reject
 * `actingAccountId === targetAccountId`. The self-action guard lives
 * at the route layer (`adminProfile.routes.ts`) so zero DB work
 * happens for self-action attempts and zero audit rows are written
 * for the rejected path. Direct callers (the logic test fixture) MUST
 * apply the same guard before calling this function.
 */
async function applyAdminMutation(
  database: DatabaseClient,
  actingAccountId: AccountId,
  targetAccountId: AccountId,
  actionType: AdminPlayerActionType,
  trimmedReason: string,
): Promise<AdminProfileResult<MutationSuccess>> {
  const targetFlag = actionType === 'suspend';
  const client = await database.connect();
  let transactionError: unknown = null;
  let writtenActionId: string | null = null;
  try {
    await client.query('BEGIN');
    // why: unconditional UPDATE — NOT a read-modify-write. Concurrent
    // admin actions producing duplicate writes are acceptable and
    // expected; idempotency at the column is DB-enforced (assignment
    // is identity when is_suspended already equals targetFlag). A
    // SELECT-then-UPDATE pattern would race two admins and either
    // (a) silently drop one side's audit row if guarded on the
    // current value, or (b) require a heavier-weight SELECT FOR
    // UPDATE that adds lock contention for no benefit.
    await client.query(
      'UPDATE legendary.players SET is_suspended = $1 WHERE ext_id = $2',
      [targetFlag, targetAccountId],
    );
    // why: the audit INSERT runs BEFORE COMMIT and shares the same
    // transaction as the column UPDATE — if either step fails the
    // ROLLBACK in the catch block discards both. The trimmed reason
    // (validated by validateReason above) is stored verbatim; the DB
    // CHECK (length(reason) BETWEEN 1 AND 500) backs the application
    // validation as defense-in-depth.
    const insertResult = await client.query(
      'INSERT INTO legendary.admin_actions ' +
        '(acting_account_id, target_account_id, action_type, reason) ' +
        'VALUES ($1, $2, $3, $4) ' +
        'RETURNING action_id',
      [actingAccountId, targetAccountId, actionType, trimmedReason],
    );
    if (insertResult.rows.length !== 1) {
      throw new Error(
        'Audit INSERT did not return exactly one row; transaction will roll back.',
      );
    }
    const rawActionId = (insertResult.rows[0] as { action_id: string | number })
      .action_id;
    writtenActionId = String(rawActionId);
    await client.query('COMMIT');
  } catch (caughtError) {
    transactionError = caughtError;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      void rollbackError;
    }
  }
  client.release();
  if (transactionError !== null || writtenActionId === null) {
    return {
      ok: false,
      reason: `Failed to apply admin ${actionType} mutation transactionally; the column update and the audit-log INSERT were rolled back together.`,
      code: 'internal_error',
    };
  }
  // why: idempotent re-suspend (or re-unsuspend) — the column update
  // is a no-op when is_suspended already equals targetFlag, but the
  // audit row is STILL written to capture admin intent + reason. The
  // observable-at-log contract from WP-107 §Acceptance Criteria is
  // satisfied here: callers see ok=true with a fresh actionId even
  // when the column was already in the requested state.
  return { ok: true, value: { actionId: writtenActionId } };
}

/**
 * Resolve a canonical handle to the target `AccountId` (a thin wrapper
 * over the WP-101 handle resolver shape, scoped to the admin namespace
 * to avoid coupling this WP's logic file to `handle.logic.ts`'s
 * internal SELECT shape). Returns `null` when no row matches.
 *
 * Exported so route handlers can resolve `:handle` -> `AccountId`
 * BEFORE applying the self-action guard (the guard compares
 * `actingAccountId` to the resolved `targetAccountId`).
 */
export async function resolveHandleToAccountId(
  database: DatabaseClient,
  canonicalHandle: string,
): Promise<AccountId | null> {
  const canonical = canonicalHandle.trim().toLowerCase();
  const result = await database.query(
    'SELECT ext_id FROM legendary.players WHERE handle_canonical = $1 LIMIT 1',
    [canonical],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0] as { ext_id: string };
  return row.ext_id as AccountId;
}

/**
 * Public function consumed by `POST /api/admin/players/:handle/suspend`.
 * Validates the reason, then applies the suspension mutation
 * transactionally via `applyAdminMutation`. The self-action guard is
 * the caller's responsibility (the route handler short-circuits before
 * calling this function when `actingAccountId === targetAccountId`).
 */
export async function suspendPlayer(
  database: DatabaseClient,
  actingAccountId: AccountId,
  targetAccountId: AccountId,
  rawReason: unknown,
): Promise<AdminProfileResult<MutationSuccess>> {
  const reasonValidation = validateReason(rawReason);
  if (reasonValidation.ok === false) {
    return reasonValidation;
  }
  return applyAdminMutation(
    database,
    actingAccountId,
    targetAccountId,
    'suspend',
    reasonValidation.value,
  );
}

/**
 * Public function consumed by
 * `POST /api/admin/players/:handle/unsuspend`. Mirrors `suspendPlayer`
 * with `actionType: 'unsuspend'`.
 */
export async function unsuspendPlayer(
  database: DatabaseClient,
  actingAccountId: AccountId,
  targetAccountId: AccountId,
  rawReason: unknown,
): Promise<AdminProfileResult<MutationSuccess>> {
  const reasonValidation = validateReason(rawReason);
  if (reasonValidation.ok === false) {
    return reasonValidation;
  }
  return applyAdminMutation(
    database,
    actingAccountId,
    targetAccountId,
    'unsuspend',
    reasonValidation.value,
  );
}
