/**
 * Admin Billing Logic — Server Layer (WP-110)
 *
 * Read-only cross-account query against
 * `legendary.stripe_checkout_sessions` for the admin billing
 * visibility surface. Unlike the owner-facing
 * `getBillingHistoryForAccount` (WP-108), this helper has no
 * `account_id` filter — it returns all rows for cross-account
 * correlation.
 *
 * Layer-boundary contract: imports from `./billing.types.js` and
 * `./adminBilling.types.js` only. No Stripe SDK. No game-engine,
 * registry, or preplan imports.
 *
 * // why: read-only invariant — this file contains zero INSERT,
 * // UPDATE, or DELETE statements by construction.
 *
 * Authority: WP-110 §C; EC-163 §Locked Values; D-11002.
 */

import type { BillingResult, DatabaseClient } from './billing.types.js';
import type { AdminBillingEntry } from './adminBilling.types.js';

/**
 * Fetch the cross-account admin billing history. Returns an ordered
 * list of checkout session entries (newest first), capped at 250 rows,
 * or a structured failure on database fault.
 */
export async function getAdminBillingHistory(
  database: DatabaseClient,
): Promise<BillingResult<AdminBillingEntry[]>> {
  try {
    // why: LIMIT 250 prevents unbounded-query abuse on the admin
    // surface. The cap is deliberately higher than the owner-facing
    // LIMIT 100 (WP-108) because the admin surface covers all
    // accounts. If pagination is needed, a follow-up WP adds
    // offset-based paging.
    const result = await database.query(
      'SELECT account_id, session_id, entitlement_key, intent_status, created_at, completed_at FROM legendary.stripe_checkout_sessions ORDER BY created_at DESC LIMIT 250',
    );

    const entries: AdminBillingEntry[] = [];
    for (const row of result.rows) {
      entries.push({
        accountId: row.account_id,
        sessionId: row.session_id,
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
      reason: 'Database fault while reading admin billing history.',
      code: 'history_lookup_failed',
    };
  }
}
