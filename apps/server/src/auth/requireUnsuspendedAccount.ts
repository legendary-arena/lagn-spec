/**
 * Require Unsuspended Account — Server Layer (WP-107)
 *
 * Shared intake-check helper consumed by future write-path request-
 * handler WPs (the immediate first caller will be the score-submission
 * request-handler WP that introduces the HTTP route over WP-053's
 * `submitCompetitiveScore` library function). Returns `Result.ok` when
 * the supplied `AccountId` exists in `legendary.players` AND
 * `is_suspended` is `false`. Returns a closed-union failure code in
 * the two faulty branches:
 *
 *   - `'suspended'` — row exists, `is_suspended = TRUE`
 *   - `'lookup_failed'` — row missing OR DB throws OR row-schema fault
 *
 * **Library-only.** This file ships with no caller in WP-107. The
 * HTTP error mapping is locked in WP-107 §Locked contract values as a
 * caller-contract for the future score-submission request-handler WP:
 *
 *   `'suspended'`      -> HTTP 403, body
 *                         `{ code: 'forbidden',
 *                            reason: 'Account is suspended.' }`
 *   `'lookup_failed'`  -> HTTP 500, body
 *                         `{ code: 'internal_error' }`
 *
 * The helper lives under `apps/server/src/auth/` (NOT
 * `apps/server/src/profile/admin/`) because the score-submission
 * intake — and any future write-path that needs this guard — is a
 * broker-agnostic auth concern that must not depend on the
 * profile-admin namespace. Placing it under `profile/admin/` would
 * invert the dependency direction (the future score-submission route
 * would import from profile-admin).
 *
 * **No-throw discipline**: every fault category returns a typed
 * `Result`. The helper never propagates a DB exception to its caller;
 * catch-and-return is the only path out.
 *
 * Authority: WP-107 §Locked contract values; WP-107 §Scope (In) §D;
 * EC-195 §Locked Values (`requireUnsuspendedAccount` -> HTTP error
 * mapping); D-10701 (account-level scope); D-10702 (audit log
 * append-only single-table); WP-159 / D-15902 single-column-read
 * precedent (`adminSession.ts`).
 */

import type {
  AccountId,
  DatabaseClient,
} from '../identity/identity.types.js';

/**
 * Closed union of programmatic error codes returned by
 * `requireUnsuspendedAccount`. Mirrors the WP-159 `AdminSessionResult`
 * closed-union pattern: two values, distinguishable so the future
 * caller can map each to its locked HTTP status (403 vs 500).
 *
 * Adding a value requires updating both this union and
 * `REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES` in the same change; the
 * drift-detection test in the sibling `.test.ts` file asserts forward
 * and backward inclusion.
 */
export type RequireUnsuspendedAccountErrorCode =
  | 'suspended'
  | 'lookup_failed';

/**
 * Canonical readonly array mirroring
 * `RequireUnsuspendedAccountErrorCode`. Paired with the union per
 * `00.6-code-style.md §Drift Detection`.
 */
export const REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES: readonly RequireUnsuspendedAccountErrorCode[] = [
  'suspended',
  'lookup_failed',
] as const;

/**
 * Discriminated-union result shape returned by
 * `requireUnsuspendedAccount`. The `ok: true` branch carries no
 * payload (the success signal IS the absence of a failure code). The
 * failure branch carries a closed-union `code` for programmatic
 * dispatch + a full-sentence `reason` (per code-style Rule 11).
 *
 * Locally declared rather than re-imported from the identity layer's
 * `Result<T>` because that type is keyed on `IdentityErrorCode` and
 * cannot carry the WP-107 codes; mirrors WP-159's
 * `AdminSessionResult` precedent verbatim.
 */
export type RequireUnsuspendedAccountResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: RequireUnsuspendedAccountErrorCode;
      readonly reason: string;
    };

// why: canonical static reason strings — exact-string asserted in the
// sibling test file. Centralizing them as module-private constants
// prevents drift between the return sites and the test fixtures. Any
// edit here must be mirrored in the test file (which intentionally
// re-states the literals rather than importing these constants, so
// the assertion proves the helper's output against the spec rather
// than self-referencing). Mirrors WP-159 / adminSession.ts §A
// pattern.
const SUSPENDED_REASON = 'Account is suspended.';
const LOOKUP_FAILED_ZERO_ROW_REASON =
  'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this intake check.';
const LOOKUP_FAILED_DB_THROW_REASON =
  'Failed to read suspension state for the supplied accountId.';
const LOOKUP_FAILED_MULTI_ROW_REASON =
  'Supplied accountId resolves to multiple legendary.players rows (data integrity fault).';
const LOOKUP_FAILED_ROW_SCHEMA_REASON =
  'Suspension flag on the matched legendary.players row is missing or not a boolean (row-schema fault).';

// why: AccountId is brand-tied 1:1 to the ext_id column on
// legendary.players per WP-052 D-5201. The resolver chain that
// produced accountId read from that column at lookup time, so binding
// $1 directly is safe. Any future identity refactor that changes the
// resolution column INVALIDATES this helper — the query below and the
// `'lookup_failed'` zero-row branch BOTH require coordinated revision
// before the helper executes against the new schema. Mirrors the
// WP-159 ADMIN_LOOKUP_SQL pattern verbatim.
const SUSPENSION_LOOKUP_SQL =
  'SELECT is_suspended FROM legendary.players WHERE ext_id = $1';

/**
 * Resolve a write-path intake check: does the supplied `AccountId`
 * correspond to an unsuspended player? Composes a single SELECT
 * against `legendary.players.is_suspended` with structured-result
 * dispatch over the four observed branches:
 *
 *   1. DB read throws -> `'lookup_failed'` (DB-throw reason).
 *   2. DB read returns zero rows -> `'lookup_failed'` (zero-row reason).
 *   3. DB read returns >= 2 rows -> `'lookup_failed'` (multi-row reason;
 *      structurally unreachable given the UNIQUE constraint on ext_id
 *      per migration 004, but coded fail-closed).
 *   4. DB read returns one row + non-boolean flag -> `'lookup_failed'`
 *      (row-schema reason).
 *   5. DB read returns one row + `is_suspended = TRUE` -> `'suspended'`.
 *   6. DB read returns one row + `is_suspended = FALSE` -> `{ ok: true }`
 *      (the ONLY success path).
 *
 * The future score-submission request-handler WP's HTTP mapping (per
 * WP-107 §Locked contract values):
 *
 *   `'suspended'`     -> 403 `{ code: 'forbidden', reason: 'Account is suspended.' }`
 *   `'lookup_failed'` -> 500 `{ code: 'internal_error' }`
 *
 * is enforced at that WP's route handler, NOT here. This helper
 * remains broker-agnostic at the library boundary.
 */
export async function requireUnsuspendedAccount(
  database: DatabaseClient,
  accountId: AccountId,
): Promise<RequireUnsuspendedAccountResult> {
  let rows: ReadonlyArray<{ readonly is_suspended: unknown }>;
  try {
    const queryResult = await database.query(SUSPENSION_LOOKUP_SQL, [
      accountId,
    ]);
    rows = queryResult.rows as ReadonlyArray<{
      readonly is_suspended: unknown;
    }>;
  } catch {
    // why: operational fault opacity per the WP-052 / WP-112 /
    // WP-159 precedent — the underlying DB error is never surfaced
    // verbatim to callers. The closed-union `lookup_failed` code +
    // the static DB-throw reason are the only signal a caller
    // receives; operators inspect server-side logs (emitted by the
    // DB layer before throwing) for the underlying cause.
    return {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_DB_THROW_REASON,
    };
  }
  if (rows.length === 0) {
    return {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_ZERO_ROW_REASON,
    };
  }
  if (rows.length >= 2) {
    // why: the ext_id column has a UNIQUE constraint per migration
    // 004, so a resolver-accepted accountId resolving to >= 2 rows is
    // logically unreachable in well-formed databases. The branch is
    // still coded fail-closed per the WP-159 §A control-flow
    // precedent — a data-integrity fault MUST NOT silently route
    // through the unsuspended-grant path.
    return {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_MULTI_ROW_REASON,
    };
  }
  const row = rows[0];
  if (typeof row.is_suspended !== 'boolean') {
    return {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_ROW_SCHEMA_REASON,
    };
  }
  // why: strict triple-equals (not truthy coercion) defends against a
  // malformed row whose suspension flag is `1`, `"true"`, an object,
  // or any other truthy non-`true` value. The row-schema typeof
  // guard above rejects every non-boolean shape to `lookup_failed`;
  // this branch is reached only after the value is provably `true`
  // or `false`. Mirrors WP-159's strict-equality pattern verbatim.
  if (row.is_suspended === true) {
    return {
      ok: false,
      code: 'suspended',
      reason: SUSPENDED_REASON,
    };
  }
  // is_suspended === false — the ONLY success path
  return { ok: true };
}
