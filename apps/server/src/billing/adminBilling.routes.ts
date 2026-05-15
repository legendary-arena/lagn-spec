/**
 * Admin Billing HTTP Routes — Server Layer (WP-110)
 *
 * Registers one HTTP endpoint on the existing Koa router:
 *
 *   * `GET /api/admin/billing/history` — `admin-secret` auth (shared-
 *     secret header gate per D-11001); no user session required.
 *     Status-code domain `{200, 401, 500}`.
 *
 * Mirrors the WP-108 `billingHistory.routes.ts` structural shape:
 * local `KoaContext` / `KoaRouter` interfaces (no direct `@koa/router`
 * import) and a `Cache-Control: no-store` header set as the FIRST
 * statement of every handler body per WP-115 D-11504.
 *
 * Layer-boundary contract: imports from `./adminBilling.logic.js`,
 * `../auth/adminGate.js`, and `./billing.types.js`. No Stripe SDK.
 * No game-engine, registry, or preplan imports.
 *
 * Authority: WP-110 §D; EC-163 §Locked Values; D-11001; D-11002.
 */

import type { IncomingMessage } from 'node:http';
import type { DatabaseClient } from './billing.types.js';
import { requireAdminSecret } from '../auth/adminGate.js';
import { getAdminBillingHistory } from './adminBilling.logic.js';

interface KoaAdminBillingContext {
  readonly req: IncomingMessage;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

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
): void {
  router.get('/api/admin/billing/history', async (koaContext) => {
    // why: Cache-Control: no-store — admin billing data contains
    // cross-account checkout session details that must never be cached
    // by an intermediate proxy or browser. Set as the first statement
    // per WP-115 D-11504 lock so a thrown exception still leaves the
    // header set.
    koaContext.set('Cache-Control', 'no-store');

    try {
      const authResult = requireAdminSecret(koaContext.req);
      if (authResult.ok === false) {
        koaContext.status = 401;
        koaContext.body = { code: 'unauthorized' };
        return;
      }

      const result = await getAdminBillingHistory(database);
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = { entries: result.value };
        return;
      }

      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });
}
