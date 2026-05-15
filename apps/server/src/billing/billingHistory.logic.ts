/**
 * Billing History Logic — Server Layer (WP-108)
 *
 * Read-only query against `legendary.stripe_checkout_sessions` for the
 * authenticated owner's purchase history. Two-query pattern mirrors
 * `getEntitlementsForAccount` from WP-132: Step 1 existence check
 * against `legendary.players`, Step 2 SELECT by `account_id`.
 *
 * Layer-boundary contract: imports from `./billing.types.js` only. No
 * Stripe SDK. No game-engine, registry, or preplan imports.
 *
 * Authority: WP-108; EC-158 §4; D-10801; D-13302 Option A.
 */

import type {
  AccountId,
  BillingHistoryEntry,
  BillingResult,
  DatabaseClient,
} from './billing.types.js';

/**
 * Fetch the billing history for the given account. Returns an ordered
 * list of checkout session entries (newest first), or a structured
 * failure if the account does not exist or a database fault occurs.
 */
export async function getBillingHistoryForAccount(
  accountId: AccountId,
  database: DatabaseClient,
): Promise<BillingResult<BillingHistoryEntry[]>> {
  try {
    // why: D-13302 Option A — `account_id` stores `ext_id text` on
    // `legendary.stripe_checkout_sessions`. Step 1 verifies the account
    // exists in `legendary.players` before querying checkout sessions;
    // a missing account is an operational fault (the auth orchestrator
    // resolved the session to an account that no longer exists).
    const existenceResult = await database.query(
      'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
      [accountId],
    );
    if (existenceResult.rows.length === 0) {
      return {
        ok: false,
        reason: 'Account not found in legendary.players for the authenticated session; the account may have been deleted.',
        code: 'history_lookup_failed',
      };
    }

    // why: read-only invariant — this file contains zero INSERT, UPDATE,
    // or DELETE statements by construction. The LIMIT 100 cap prevents
    // unbounded result sets for accounts with extensive purchase history;
    // rows beyond the cap are silently omitted (acceptable for a profile
    // page summary surface).
    const historyResult = await database.query(
      'SELECT entitlement_key, intent_status, created_at, completed_at FROM legendary.stripe_checkout_sessions WHERE account_id = $1 ORDER BY created_at DESC LIMIT 100',
      [accountId],
    );

    const entries: BillingHistoryEntry[] = [];
    for (const row of historyResult.rows) {
      entries.push({
        entitlementKey: row.entitlement_key,
        intentStatus: row.intent_status,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
        completedAt:
          row.completed_at === null || row.completed_at === undefined
            ? null
            : row.completed_at instanceof Date
              ? row.completed_at.toISOString()
              : String(row.completed_at),
      });
    }

    return { ok: true, value: entries };
  } catch (caughtError) {
    void caughtError;
    return {
      ok: false,
      reason: 'Database fault while reading billing history for the authenticated account.',
      code: 'history_lookup_failed',
    };
  }
}
