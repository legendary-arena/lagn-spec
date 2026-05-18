/**
 * Admin Billing API Client — Arena Client (WP-110)
 *
 * Typed `fetch` wrapper for the admin billing history endpoint.
 * Consumed by `apps/arena-client/src/pages/AdminBillingPage.vue`.
 *
 * Layer-boundary contract: this module imports nothing from
 * `apps/server/`, `@legendary-arena/*`, `boardgame.io`, or
 * `vue-sfc-loader`. Wire shapes are declared inline by structural
 * compatibility with their server-side counterparts.
 *
 * Authority: WP-110 §F; EC-163 §Files to Produce.
 * WP-161 update: fetch URL now prefixed via `buildApiUrl(...)` so the
 * SPA can target the API host configured via `VITE_API_BASE_URL` at
 * build time. Wire shape, function signature, and error handling are
 * byte-identical to WP-110; only the URL string differs.
 */

import { buildApiUrl } from './apiBaseUrl';

/**
 * One row from the admin billing history response, mirroring the
 * server's `AdminBillingEntry` by structural compatibility.
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
 * Discriminated-union result type for the admin billing fetch wrapper.
 */
export type AdminBillingApiResult =
  | { ok: true; value: AdminBillingEntry[] }
  | { ok: false; status: number; code: string | null };

/**
 * Fetch the cross-account admin billing history. Sends the
 * `X-Admin-Secret` header (not `Authorization: Bearer`). Returns
 * `{ ok: true, value }` on HTTP 200; returns
 * `{ ok: false, status, code }` on every other status.
 */
export async function fetchAdminBillingHistory(
  adminSecret: string,
): Promise<AdminBillingApiResult> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl('/api/admin/billing/history'), {
      method: 'GET',
      headers: { 'X-Admin-Secret': adminSecret },
    });
  } catch {
    return { ok: false, status: 0, code: null };
  }
  if (response.status !== 200) {
    let code: string | null = null;
    try {
      const body = (await response.json()) as { error?: unknown; code?: unknown };
      if (typeof body.error === 'string') {
        code = body.error;
      } else if (typeof body.code === 'string') {
        code = body.code;
      }
    } catch {
      code = null;
    }
    return { ok: false, status: response.status, code };
  }
  const body = (await response.json()) as { entries: AdminBillingEntry[] };
  return { ok: true, value: body.entries };
}
