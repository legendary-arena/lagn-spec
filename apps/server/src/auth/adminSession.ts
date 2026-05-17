/**
 * Admin Session Gate — Server Layer (WP-159)
 *
 * Single source of truth for admin-session authorization. Composes
 * the WP-112 session orchestrator with a single boolean admin
 * authorization flag on `legendary.players` (added by migration 014)
 * to produce a three-value closed-union result for admin-only routes.
 *
 * Isolated in this file — mirroring the WP-110 `adminGate.ts`
 * file-isolation precedent — so a future RBAC WP can swap the
 * authorization decision (e.g., a join against a future
 * `legendary.player_roles` table) without rippling through caller
 * routes. The success shape (`{ ok: true; accountId }`) stays
 * identical under either backing storage by construction.
 *
 * Repo-level invariant: this is the ONLY file in the repository
 * that issues a SELECT against the admin authorization flag column
 * on `legendary.players`. Direct inline reads by any future caller
 * silently break the forward-compatibility migration to a
 * role/permission system; a repo-wide grep gate in WP-159
 * §Verification Steps enforces the seam at every commit.
 *
 * Authority: WP-159 §A; EC-173 §Locked Values; D-15901
 * (gate composition); D-15902 (single-column authorization).
 */

import type {
  AccountId,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
} from './sessionToken.types.js';
import { requireAuthenticatedSession } from './sessionToken.logic.js';

/**
 * Closed-union error codes returned by `requireAdminSession` to its
 * callers (future admin-route WPs). Three values: upstream session
 * rejection, admin-privilege absence, and operational lookup fault.
 *
 * The upstream `SessionValidationErrorCode` surface (six values)
 * collapses to the single `'unauthorized'` value here — admin-route
 * dispatch never branches on the upstream taxonomy.
 */
export type AdminSessionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'lookup_failed';

/**
 * Canonical readonly array mirroring `AdminSessionErrorCode`. Paired
 * with the union per `00.6-code-style.md §Drift Detection`. The
 * drift-detection test (test 9) asserts bidirectional Set equality
 * — adding or removing a code must touch both this array and the
 * union in the same change.
 */
export const ADMIN_SESSION_ERROR_CODES: readonly AdminSessionErrorCode[] = [
  'unauthorized',
  'forbidden',
  'lookup_failed',
] as const;

/**
 * Discriminated-union result returned by `requireAdminSession`. The
 * success branch carries the `AccountId` so callers can record the
 * acting admin in audit logs (WP-107's first use case). The failure
 * branch carries a closed-union `code` for programmatic dispatch and
 * a deterministic static `reason` string per the canonical sentences
 * below.
 */
export type AdminSessionResult =
  | { readonly ok: true; readonly accountId: AccountId }
  | {
      readonly ok: false;
      readonly code: AdminSessionErrorCode;
      readonly reason: string;
    };

// why: the five canonical reason strings are exact-string asserted in
// the unit tests. Centralizing them as module-private constants
// prevents drift between the seven return sites and the test
// fixtures. Any edit to a string here must be mirrored in the test
// file (which intentionally re-states the literals rather than
// importing these constants, so the assertion proves the helper's
// output rather than self-referencing).
const UNAUTHORIZED_REASON =
  'Admin session validation failed: upstream session check rejected the request.';
const FORBIDDEN_REASON =
  'Authenticated account does not have admin privileges.';
const LOOKUP_FAILED_ZERO_ROW_REASON =
  'Authenticated account is not present in the players table.';
const LOOKUP_FAILED_DB_THROW_REASON =
  'Failed to read admin authorization for the authenticated account.';
const LOOKUP_FAILED_MULTI_ROW_REASON =
  'Authenticated account resolves to multiple players rows (data integrity fault).';

// why: AccountId is brand-tied 1:1 to the cross-service identifier
// column on `legendary.players` (the ext-id column) per WP-052
// D-5201. The resolver chain that produced accountId read from that
// column at lookup time, so binding accountId directly to $1 is
// safe. Any future identity refactor that changes the resolution
// column INVALIDATES WP-159 — the query below and the §A
// control-flow table both require coordinated revision before the
// helper executes against the new schema.
const ADMIN_LOOKUP_SQL =
  'SELECT is_admin FROM legendary.players WHERE ext_id = $1';

/**
 * Compose the WP-112 session orchestrator with a fresh single-column
 * read of the admin authorization flag for the resolved account. The
 * function never throws — every fault category translates to a
 * `Result.fail`-shaped `AdminSessionResult`.
 *
 * Behaviour summary (authoritative table is WP-159 §A):
 *
 *   1. Upstream session check fails → `'unauthorized'`.
 *   2. DB read throws → `'lookup_failed'` (DB-throw reason).
 *   3. DB read returns zero rows → `'lookup_failed'` (zero-row reason).
 *   4. DB read returns ≥ 2 rows → `'lookup_failed'` (multi-row reason).
 *   5. DB read returns one row but the admin flag is missing /
 *      non-boolean → `'lookup_failed'` (DB-throw reason).
 *   6. DB read returns one row, admin flag strictly `false` →
 *      `'forbidden'`.
 *   7. DB read returns one row, admin flag strictly `true` →
 *      `{ ok: true, accountId }`. This is the ONLY success path.
 */
export async function requireAdminSession(
  request: SessionTokenRequest,
  options: RequireAuthenticatedSessionOptions,
): Promise<AdminSessionResult> {
  const sessionResult = await requireAuthenticatedSession(request, options);
  if (sessionResult.ok === false) {
    // why: the upstream session orchestrator's closed-union code
    // surface is its own internal contract (six values:
    // missing-token, invalid-token, expired-token, unknown-account,
    // session-verifier-not-configured, lookup-failed). The admin
    // gate's public error surface is a separate three-value closed
    // union; the upstream code is collapsed to the single
    // 'unauthorized' value so admin-route dispatch never needs to
    // know the orchestrator's internal taxonomy.
    return {
      ok: false,
      code: 'unauthorized',
      reason: UNAUTHORIZED_REASON,
    };
  }
  const accountId = sessionResult.value;
  let rows: ReadonlyArray<{ readonly is_admin: unknown }>;
  try {
    const queryResult = await options.database.query(
      ADMIN_LOOKUP_SQL,
      [accountId],
    );
    rows = queryResult.rows as ReadonlyArray<{ readonly is_admin: unknown }>;
  } catch {
    // why: operational fault opacity per the WP-052 / WP-112
    // precedent — the underlying DB error is never surfaced verbatim
    // to callers. The closed-union `lookup_failed` code + the static
    // DB-throw reason are the only signal a route handler receives;
    // operators inspect server-side logs (emitted by the DB layer
    // before throwing) for the underlying cause.
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
    // why: the cross-service identifier column has a UNIQUE
    // constraint per migration 004, so a verifier-accepted accountId
    // resolving to ≥ 2 rows is logically unreachable in well-formed
    // databases. The branch is still coded fail-closed per the §A
    // control-flow table — a data-integrity fault MUST NOT silently
    // route through the admin-grant path.
    return {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_MULTI_ROW_REASON,
    };
  }
  const row = rows[0];
  if (typeof row.is_admin !== 'boolean') {
    return {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_DB_THROW_REASON,
    };
  }
  // why: strict triple-equals (not truthy coercion) defends against
  // a malformed row whose admin authorization flag is `1`, `"true"`,
  // an object, or any other truthy non-`true` value. The row-schema
  // typeof guard above rejects every non-boolean shape to
  // `lookup_failed`; this branch is reached only after the value is
  // provably `true` or `false`. `=== true` is the only success
  // path; `=== false` resolves to `'forbidden'` per §A.
  if (row.is_admin === true) {
    return { ok: true, accountId };
  }
  if (row.is_admin === false) {
    return {
      ok: false,
      code: 'forbidden',
      reason: FORBIDDEN_REASON,
    };
  }
  // why: typeof guard above narrows the value to exactly `true` or
  // `false`, so this branch is unreachable. Coded fail-closed as a
  // belt-and-suspenders defense against future row-schema drift —
  // an unexpected value MUST NOT silently route through the admin
  // grant path.
  return {
    ok: false,
    code: 'lookup_failed',
    reason: LOOKUP_FAILED_DB_THROW_REASON,
  };
}
