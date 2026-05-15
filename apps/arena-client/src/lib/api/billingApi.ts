/**
 * Billing API Client — Arena Client (WP-108)
 *
 * Typed `fetch` wrappers for the billing history and entitlements
 * read endpoints. Consumed by
 * `apps/arena-client/src/components/BillingSection.vue`.
 *
 * Layer-boundary contract: this module imports nothing from
 * `apps/server/`, `@legendary-arena/*`, `boardgame.io`, or
 * `vue-sfc-loader`. Wire shapes are declared inline by structural
 * compatibility with their server-side counterparts.
 *
 * Authority: WP-108 §Scope; EC-158 §6.
 */

/**
 * One row from the billing history response, mirroring the server's
 * `BillingHistoryEntry` by structural compatibility.
 */
export interface BillingHistoryEntry {
  readonly entitlementKey: string;
  readonly intentStatus: 'open' | 'completed' | 'expired' | 'canceled';
  readonly createdAt: string;
  readonly completedAt: string | null;
}

/**
 * Entitlement display shape mirroring the server's `Entitlement`
 * interface (3 rendered fields only).
 */
export interface EntitlementDisplay {
  readonly entitlementKey: string;
  readonly source: 'stripe' | 'admin_grant' | 'comp';
  readonly grantedAt: string;
}

/**
 * Discriminated-union result type for the billing fetch wrappers.
 */
export type BillingApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string | null };

async function parseFailure(
  response: Response,
): Promise<{ ok: false; status: number; code: string | null }> {
  let code: string | null = null;
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown };
    if (typeof body.error === 'string') {
      code = body.error;
    } else if (typeof body.code === 'string') {
      code = body.code;
    }
  } catch {
    // why: a malformed JSON response (or no body) is a transport-level
    // failure; we surface only the status code.
    code = null;
  }
  return { ok: false, status: response.status, code };
}

/**
 * Fetch the authenticated owner's billing history. Returns
 * `{ ok: true, value }` on HTTP 200; returns
 * `{ ok: false, status, code }` on every other status.
 */
export async function fetchBillingHistory(
  authToken: string | null,
): Promise<BillingApiResult<BillingHistoryEntry[]>> {
  let response: Response;
  try {
    response = await fetch('/api/me/billing/history', {
      method: 'GET',
      headers:
        authToken === null ? {} : { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    return { ok: false, status: 0, code: null };
  }
  if (response.status !== 200) {
    return await parseFailure(response);
  }
  const body = (await response.json()) as { history: BillingHistoryEntry[] };
  return { ok: true, value: body.history };
}

/**
 * Fetch the authenticated owner's active entitlements. Returns
 * `{ ok: true, value }` on HTTP 200; returns
 * `{ ok: false, status, code }` on every other status.
 */
export async function fetchEntitlements(
  authToken: string | null,
): Promise<BillingApiResult<EntitlementDisplay[]>> {
  let response: Response;
  try {
    response = await fetch('/api/me/entitlements', {
      method: 'GET',
      headers:
        authToken === null ? {} : { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    return { ok: false, status: 0, code: null };
  }
  if (response.status !== 200) {
    return await parseFailure(response);
  }
  const body = (await response.json()) as { entitlements: EntitlementDisplay[] };
  return { ok: true, value: body.entitlements };
}
