/**
 * Admin Billing Types — Server Layer (WP-110)
 *
 * Standalone types for the admin billing visibility surface
 * (`GET /api/admin/billing/history`). Declared independently of the
 * owner-facing `BillingHistoryEntry` (WP-108) per D-11002 — changes
 * to the owner surface do not ripple into the admin surface.
 *
 * `AdminBillingEntry` is a superset of `BillingHistoryEntry`, adding
 * `accountId` and `sessionId` for cross-account correlation.
 * `price_id` is deliberately excluded per WP-110 §Non-Negotiable
 * Constraints.
 *
 * Authority: WP-110 §B; EC-163 §Locked Values; D-11002.
 */

/**
 * One row from `legendary.stripe_checkout_sessions` projected for the
 * admin billing visibility surface (`GET /api/admin/billing/history`).
 */
export interface AdminBillingEntry {
  readonly accountId: string;
  readonly sessionId: string;
  readonly entitlementKey: string;
  readonly intentStatus: 'open' | 'completed' | 'expired' | 'canceled';
  readonly createdAt: string;
  readonly completedAt: string | null;
}

/**
 * Wire shape returned by `GET /api/admin/billing/history` on success.
 */
export interface AdminBillingResponse {
  readonly entries: readonly AdminBillingEntry[];
}
