/**
 * Account Provisioning Logic — Server Layer (WP-174)
 *
 * `provisionPlayerAccount` performs a race-safe INSERT ... ON CONFLICT
 * (auth_provider, auth_provider_id) DO NOTHING + re-SELECT pattern.
 * This helper is the SOLE write site invoked by the account resolver's
 * no-match branch; it does NOT call `createPlayerAccount` from
 * `identity.logic.ts` (that function is a WP-052 contract file and
 * does not support ON CONFLICT semantics).
 *
 * Layer-boundary contract: this module imports nothing from
 * boardgame.io, the engine package, the registry package, the
 * pre-planning package, or any UI / client / replay-producer package.
 * The only runtime import is `node:crypto.randomUUID`.
 *
 * Authority: WP-174 §E; D-17402 (provisioning helper design choice);
 * EC-196 (locked values — ON CONFLICT target, index name, atomicity).
 */

import { randomUUID } from 'node:crypto';

import type {
  AccountId,
  AuthProvider,
  DatabaseClient,
  Result,
} from '../identity/identity.types.js';

/**
 * Provisioned account shape returned on success. Carries the fields
 * the account resolver needs to map to `AccountId`.
 */
export interface ProvisionedAccount {
  readonly accountId: AccountId;
  readonly email: string;
  readonly displayName: string;
  readonly authProvider: AuthProvider;
  readonly authProviderId: string;
}

/**
 * Race-safe account provisioning via INSERT ... ON CONFLICT DO NOTHING.
 * If the INSERT succeeds, returns the new row. If a concurrent insert
 * won the race (ON CONFLICT fires), re-SELECTs the winning row by
 * `(auth_provider, auth_provider_id)` to guarantee idempotency: the
 * same claim pair always resolves to the same `accountId`.
 *
 * The function performs a SINGLE INSERT statement — no multi-step
 * creation sequence, no BEGIN/COMMIT wrapper. Atomicity is guaranteed
 * by PostgreSQL's single-statement transaction semantics.
 */
export async function provisionPlayerAccount(
  input: {
    readonly email: string;
    readonly displayName: string;
    readonly authProvider: AuthProvider;
    readonly authProviderId: string;
  },
  database: DatabaseClient,
  idProvider: () => string = randomUUID,
): Promise<Result<ProvisionedAccount>> {
  const accountId = idProvider() as AccountId;

  try {
    // why: ON CONFLICT (auth_provider, auth_provider_id) DO NOTHING
    // ensures race-safety + idempotency — concurrent first-sign-in
    // calls for the same user resolve to a single row without throwing
    const insertResult = await database.query(
      'INSERT INTO legendary.players ' +
        '(ext_id, email, display_name, auth_provider, auth_provider_id) ' +
        'VALUES ($1, $2, $3, $4, $5) ' +
        'ON CONFLICT (auth_provider, auth_provider_id) DO NOTHING ' +
        'RETURNING ext_id, email, display_name, auth_provider, auth_provider_id',
      [
        accountId,
        input.email,
        input.displayName,
        input.authProvider,
        input.authProviderId,
      ],
    );

    if (insertResult.rows.length > 0) {
      return {
        ok: true,
        value: mapProvisionedRow(insertResult.rows[0]),
      };
    }

    const selectResult = await database.query(
      'SELECT ext_id, email, display_name, auth_provider, auth_provider_id ' +
        'FROM legendary.players ' +
        'WHERE auth_provider = $1 AND auth_provider_id = $2 ' +
        'LIMIT 1',
      [input.authProvider, input.authProviderId],
    );

    if (selectResult.rows.length === 0) {
      return {
        ok: false,
        reason:
          'Account provisioning conflict detected but the winning row could not be located by (auth_provider, auth_provider_id); check database consistency.',
        code: 'unknown_account' as never,
      };
    }

    return {
      ok: true,
      value: mapProvisionedRow(selectResult.rows[0]),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === '23505'
    ) {
      return {
        ok: false,
        reason:
          `Email already registered for an existing account under a different auth provider; automatic account linking is not supported. Underlying error: ${errorMessage}`,
        code: 'duplicate_email' as never,
      };
    }

    return {
      ok: false,
      reason:
        `Account provisioning failed for authProvider="${input.authProvider}"; check database connectivity and permissions. Underlying error: ${errorMessage}`,
      code: 'lookup_failed' as never,
    };
  }
}

/**
 * Map a `legendary.players` row (snake_case columns) to the
 * `ProvisionedAccount` shape (camelCase fields). Brand-cast for
 * `accountId` happens here at the insert boundary.
 */
function mapProvisionedRow(row: {
  ext_id: string;
  email: string;
  display_name: string;
  auth_provider: string;
  auth_provider_id: string;
}): ProvisionedAccount {
  return {
    accountId: row.ext_id as AccountId,
    email: row.email,
    displayName: row.display_name,
    authProvider: row.auth_provider as AuthProvider,
    authProviderId: row.auth_provider_id,
  };
}
