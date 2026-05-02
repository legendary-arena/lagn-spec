/**
 * Account Lookup Logic — Server Layer (WP-112)
 *
 * Read-only `findAccountByAuthProviderSub` helper that resolves a
 * verifier-produced `(authProvider, authProviderSub)` claim pair to
 * an existing `legendary.players` row. The function is the SOLE
 * site in WP-112 that touches PostgreSQL, the SOLE site that
 * performs the `authProviderSub` → `authProviderId` field-name
 * translation (the rename happens at the SQL parameter binding
 * below), and the SOLE site under `apps/server/src/auth/` that
 * issues a SELECT against `legendary.players`.
 *
 * Layer-boundary contract: this module imports nothing from
 * boardgame.io, the engine package, the registry package, the
 * pre-planning package, or any UI / client / replay-producer
 * package. The only imports are type aliases from the identity
 * layer and the local types module. The `pg` driver is reachable
 * only through the `DatabaseClient` alias; a direct `pg` import is
 * forbidden in this file (mirrors the WP-101 `handle.logic.ts`
 * discipline).
 *
 * Result-type contract: returns `Result.ok(null)` on a clean
 * no-match (a verifier-accepted token that doesn't yet correspond
 * to any account row — e.g., the first OIDC callback for a brand-
 * new user); returns `Result.fail({ code: 'lookup_failed' })` on a
 * database fault (connection lost, permission denied,
 * malformed-row defense). Never throws — every failure path
 * returns a typed `Result` per WP-052 D-5201.
 *
 * Single-reader invariant: this module's `findAccountByAuthProviderSub`
 * is the only call site under `apps/server/src/auth/` that reads
 * `legendary.players`. WP-052 contract files
 * (`apps/server/src/identity/identity.types.ts`,
 * `apps/server/src/identity/identity.logic.ts`, migrations
 * `004_create_players_table.sql` and
 * `005_create_replay_ownership_table.sql`) are unmodified by this
 * helper.
 *
 * Authority: WP-112 §Scope (In) §D; D-11203 (signature lock —
 * positional args, `Result<HitOrNull>` shape, `'lookup_failed'`
 * on DB error, `Result.ok(null)` on no match); WP-101
 * `findAccountByHandle` (structural precedent — same caller-
 * injected `DatabaseClient`, same `LIMIT 1` projection, same
 * timestamp-Date narrowing not needed here because the projection
 * carries no timestamp columns).
 */

import type {
  AccountId,
  AuthProvider,
  DatabaseClient,
  Result,
} from '../identity/identity.types.js';

import type {
  AccountLookupHit,
  AccountLookupErrorCode,
} from './sessionToken.types.js';

/**
 * Internal shape returned by the locked SELECT. The application
 * layer maps this row to `AccountLookupHit` via `mapLookupRow`. The
 * column list is verbatim the locked projection from WP-112 §Scope
 * (In) §D — three columns, no joins, no timestamp fields (the
 * orchestrator does not need account-creation metadata for the
 * authenticate-then-resolve hot path).
 */
interface AccountLookupRow {
  ext_id: string;
  auth_provider: string;
  auth_provider_id: string;
}

/**
 * Map a `legendary.players` row (snake_case columns) to the locked
 * `AccountLookupHit` shape (camelCase fields, canonical wire-level
 * spellings). Brand-cast for `accountId` happens here at the read
 * boundary; the `auth_provider` column is widened to the
 * `AuthProvider` union by structural cast (the column carries one
 * of the WP-052 closed-set values per D-9902).
 */
function mapLookupRow(row: AccountLookupRow): AccountLookupHit {
  return {
    accountId: row.ext_id as AccountId,
    authProvider: row.auth_provider as AuthProvider,
    authProviderId: row.auth_provider_id,
  };
}

/**
 * Resolve a verifier-produced `(authProvider, authProviderSub)`
 * claim pair to an existing `legendary.players` row. Per D-11203:
 *
 * - Returns `Result.ok({ accountId, authProvider, authProviderId })`
 *   on a match; the row is mapped at exactly one site
 *   (`mapLookupRow`).
 * - Returns `Result.ok(null)` on a clean no-match — the SELECT ran
 *   successfully but no row carried the supplied claim pair. This
 *   is a normal first-callback condition for a brand-new user; the
 *   resolver translates it to `'unknown_account'` at the
 *   orchestrator boundary.
 * - Returns `Result.fail({ code: 'lookup_failed', reason })` on
 *   any database fault (connection lost, permission denied,
 *   malformed row).
 *
 * The function performs NO input canonicalization (mirrors WP-101
 * `findAccountByHandle`'s minimal-canonicalization posture for
 * already-canonicalized data — the verifier emits a stable
 * per-tenant subject identifier; canonicalizing would risk a
 * silent miss).
 *
 * The translation from `authProviderSub` (the OIDC nomenclature
 * carried at the verifier boundary and in the orchestrator's
 * type definitions) to `authProviderId` (the canonical wire-level
 * spelling per `00.2-data-requirements.md`, used in the column
 * name `auth_provider_id`) happens at the SQL parameter binding
 * below — this is the SOLE site in WP-112 where the rename
 * occurs. Other WP-112 files MUST NOT perform the same rename.
 */
export async function findAccountByAuthProviderSub(
  authProvider: AuthProvider,
  authProviderSub: string,
  database: DatabaseClient,
): Promise<Result<AccountLookupHit | null>> {
  let result;
  try {
    // why: locked projection per WP-112 §Scope (In) §D — three
    // columns, no joins, no LIMIT > 1. The translation site
    // `authProviderSub` → `auth_provider_id` lives in the
    // parameter list ($2) below; no other WP-112 file performs
    // this rename, which keeps audits and greps deterministic.
    result = await database.query(
      'SELECT ext_id, auth_provider, auth_provider_id ' +
        'FROM legendary.players ' +
        'WHERE auth_provider = $1 AND auth_provider_id = $2 ' +
        'LIMIT 1',
      [authProvider, authProviderSub],
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);
    const failureCode: AccountLookupErrorCode = 'lookup_failed';
    return {
      ok: false,
      reason:
        `Account lookup against legendary.players failed for authProvider="${authProvider}"; check database connectivity and permissions. Underlying error: ${errorMessage}`,
      code: failureCode,
    };
  }
  if (result.rows.length === 0) {
    return { ok: true, value: null };
  }
  return { ok: true, value: mapLookupRow(result.rows[0]) };
}
