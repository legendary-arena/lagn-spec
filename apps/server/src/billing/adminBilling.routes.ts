/**
 * Admin Billing HTTP Routes — Server Layer (WP-176)
 *
 * Registers one HTTP endpoint on the existing Koa router:
 *
 *   * `GET /api/admin/billing/history` — `admin-session-required` auth
 *     (Hanko session + `is_admin = TRUE` per WP-159 §A / D-15901).
 *     Status-code domain `{200, 401, 403, 500}`.
 *
 * Mirrors the WP-107 `adminProfile.routes.ts` structural shape:
 * caller-injected deps bundle, local `KoaContext` / `KoaRouter`
 * interfaces (no direct `@koa/router` import), and a
 * `Cache-Control: no-store` header set as the FIRST statement of every
 * handler body per WP-115 D-11504.
 *
 * Layer-boundary contract: imports from `./adminBilling.logic.js` and
 * `./billing.types.js`. Type-only imports from `../auth/adminSession.js`
 * and `../auth/sessionToken.types.js`. No Stripe SDK. No game-engine,
 * registry, or preplan imports.
 *
 * Authority: WP-176 §A; EC-198 §Locked Values; D-17601; D-11504.
 */

import type { DatabaseClient } from './billing.types.js';
import { getAdminBillingHistory } from './adminBilling.logic.js';
import type { AdminSessionResult } from '../auth/adminSession.js';
import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';

/**
 * Caller-injected dependency bundle for `registerAdminBillingRoutes`.
 * Mirrors `AdminProfileRouteDependencies` (WP-107): three fields, same
 * names, same optionality.
 */
export interface AdminBillingRouteDependencies {
  readonly requireAdminSession: (
    request: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<AdminSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
}

/**
 * Minimal structural shape of the Koa context surface this module
 * touches. Mirrors the WP-107 `KoaAdminProfileContext` precedent.
 */
interface KoaAdminBillingContext {
  readonly req: SessionTokenRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

/**
 * Minimal structural shape of the Koa router surface this module
 * touches.
 */
interface KoaRouter {
  get(
    path: string,
    handler: (koaContext: KoaAdminBillingContext) => Promise<void> | void,
  ): unknown;
}

/**
 * Register the admin billing route on the supplied Koa router. The
 * router is mutated in place; the function returns `void`.
 */
export function registerAdminBillingRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: AdminBillingRouteDependencies,
): void {
  router.get('/api/admin/billing/history', async (koaContext) => {
    // why: Cache-Control: no-store — admin billing data contains
    // cross-account checkout session details that must never be cached
    // by an intermediate proxy or browser. Set as the first statement
    // per WP-115 D-11504 lock so a thrown exception still leaves the
    // header set.
    koaContext.set('Cache-Control', 'no-store');

    try {
      // why: requireAdminSession replaces the WP-110 shared-secret
      // gate (admin-secret header) with the WP-159
      // session-based gate (Hanko session + is_admin = TRUE). WP-176
      // cutover; D-17601. The caller-injected deps pattern mirrors the
      // WP-107 adminProfile.routes.ts precedent.
      const authResult = await deps.requireAdminSession(koaContext.req, {
        verifier: deps.verifier,
        accountResolver: deps.accountResolver,
        database,
      });

      if (authResult.ok === true) {
        const result = await getAdminBillingHistory(database);
        if (result.ok === true) {
          koaContext.status = 200;
          koaContext.body = { entries: result.value };
          return;
        }

        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
        return;
      }

      if (authResult.code === 'unauthorized') {
        koaContext.status = 401;
        koaContext.body = { code: 'unauthorized', reason: authResult.reason };
        return;
      }

      if (authResult.code === 'forbidden') {
        koaContext.status = 403;
        koaContext.body = { code: 'forbidden', reason: authResult.reason };
        return;
      }

      if (authResult.code === 'lookup_failed') {
        koaContext.status = 500;
        koaContext.body = { code: 'internal_error' };
        return;
      }
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });
}
