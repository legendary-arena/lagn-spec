/**
 * Entitlements HTTP Routes — Server Layer (WP-132)
 *
 * Registers the read-only owner-only HTTP endpoint
 * `GET /api/me/entitlements` on the existing Koa router returned by
 * boardgame.io's `Server({...})` instance. Mirrors the structural
 * shape of `apps/server/src/profile/ownerProfile.routes.ts` and
 * `apps/server/src/teams/team.routes.ts`: local `KoaRouter` /
 * `KoaContext` interfaces (no direct `@koa/router` import), the
 * caller-injected `requireAuthenticatedSession` provider per WP-112
 * D-11202, and a `Cache-Control: no-store` header set as the FIRST
 * statement of every handler body per WP-115 D-11504.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only
 * through the supplied `DatabaseClient` parameter.
 *
 * Status-code domain `{200, 401, 500}` is closed; no other status
 * code may appear in this file. Envelope split per WP-132 §Locked
 * contract values: authentication / configuration failures carry the
 * `{ code: '<closed-set value>' }` shape; operational faults carry
 * `{ error: 'internal_error' }` per WP-115 D-11802 = (C). The two
 * envelopes are never mixed in one response body.
 *
 * Authority: WP-132 §Scope (In) §E; EC-135 §2 (status-code closed
 * set; envelope split lock); D-13201; D-13205 (route-wiring posture);
 * D-11202 (bearer header); D-11204 (fail-closed unconfigured-default,
 * superseded in production by WP-131 / D-13101); WP-115 D-11504
 * (Cache-Control first-statement lock); WP-115 D-11802 = (C)
 * (operational 500 envelope).
 */

import type {
  AccountId,
  AccountResolver,
  DatabaseClient,
  Entitlement,
  EntitlementKey,
  SessionTokenRequest,
  SessionVerifier,
} from './entitlements.types.js';
import type { RequireAuthenticatedSessionOptions } from '../auth/sessionToken.types.js';
import { ENTITLEMENT_KEYS } from './entitlements.types.js';
import { getEntitlementsForAccount } from './entitlements.logic.js';

/**
 * Closed-set re-statement of the orchestrator's
 * `Result<AccountId, SessionValidationErrorCode>` shape. Mirrors the
 * WP-104 `SessionValidationCode` precedent verbatim — declared
 * locally rather than re-imported across module boundaries.
 */
type SessionValidationCode =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'unknown_account'
  | 'session_verifier_not_configured'
  | 'lookup_failed';

type RequireAuthenticatedSessionResult =
  | { ok: true; value: AccountId }
  | { ok: false; reason: string; code: SessionValidationCode };

/**
 * Caller-injected dependency bundle for `registerEntitlementRoutes`.
 * Mirrors the WP-104 `OwnerProfileRouteDependencies` and WP-109
 * `TeamRouteDependencies` shape verbatim — same `requireAuthenticatedSession`
 * provider type, same optional `verifier` and `accountResolver`. Production
 * wiring in `apps/server/src/server.mjs` threads the same bundle
 * `{ requireAuthenticatedSession, verifier, accountResolver }` that
 * WP-131 / EC-134 already constructs for the owner-profile and team
 * routes — no second verifier or resolver instance is created.
 */
export interface EntitlementRouteDependencies {
  readonly requireAuthenticatedSession: (
    req: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
}

interface KoaEntitlementContext {
  readonly req: SessionTokenRequest;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

interface KoaRouter {
  get(
    path: string,
    handler: (koaContext: KoaEntitlementContext) => Promise<void> | void,
  ): unknown;
}

// why: dispatch closed-set SessionValidationCode values to the locked
// HTTP status (WP-104 / WP-109 precedent). 'unknown_account' returns
// 401 (NOT 403) per the account-existence-probe defense locked in
// WP-104 D-10403. 'session_verifier_not_configured' returns 500
// (operator-facing; production wiring incomplete in dev mode per
// D-13101 — unreachable in production with WP-131 wired).
// 'lookup_failed' from the orchestrator returns 500 (operational
// fault; the database is unreachable or the players row was deleted
// mid-request).
function statusForSessionValidationCode(code: SessionValidationCode): number {
  if (
    code === 'session_verifier_not_configured' ||
    code === 'lookup_failed'
  ) {
    return 500;
  }
  return 401;
}

const ENTITLEMENT_KEY_SET: ReadonlySet<EntitlementKey> = new Set(
  ENTITLEMENT_KEYS,
);

// why: route-layer drift backstop — if the SQL CHECK list in
// data/migrations/011_create_entitlements.sql and the TS-side
// EntitlementKey union diverge despite migration review, this guard
// rejects the row and the handler surfaces an operator-facing 500
// rather than letting an out-of-set value reach the client. The
// compile-time exhaustive switch in entitlements.logic.test.ts
// catches TS-side drift; this guard catches SQL-side drift; the two
// gates together provide defense-in-depth against an unreviewed
// migration that adds a key the TS union doesn't know about.
function isKnownEntitlementKey(value: string): value is EntitlementKey {
  return ENTITLEMENT_KEY_SET.has(value as EntitlementKey);
}

// why: this module is a thin Koa adapter — all entitlements
// composition lives in entitlements.logic.ts so it is independently
// testable via node:test without spinning up boardgame.io's
// Server() or any HTTP listener. Every handler invokes
// requireAuthenticatedSession as the FIRST business-logic step
// before any DB query (WP-112 D-11202 caller-injected pattern); the
// Cache-Control: no-store header is set BEFORE any branching logic
// per WP-115 D-11504 lock so error paths still carry it. The
// envelope split is locked: orchestrator auth and configuration
// faults dispatch into a body shape carrying a closed-set discriminator
// field (the four 401-mapped codes collapse to a single client-facing
// value to defeat the account-existence probe per WP-104 D-10403),
// and operational faults dispatch into a body shape carrying a single
// generic literal that does not leak which subsystem failed
// (WP-115 D-11802 = (C) precedent). The two body shapes are never
// mixed in one response.
/**
 * Register the single entitlements read endpoint on the supplied Koa
 * router. The router is mutated in place; the function returns
 * `void`. Production callers in `apps/server/src/server.mjs` pass
 * the Koa router obtained from `boardgame.io`'s `Server({...})`
 * (`server.router`), the long-lived `pg.Pool` constructed via
 * `createPool()`, and the dependency bundle WP-131 / EC-134 already
 * constructs for the owner-profile and team routes.
 */
export function registerEntitlementRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: EntitlementRouteDependencies,
): void {
  router.get('/api/me/entitlements', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    const sessionResult = await deps.requireAuthenticatedSession(
      koaContext.req,
      {
        verifier: deps.verifier,
        accountResolver: deps.accountResolver,
        database,
      },
    );
    if (sessionResult.ok === false) {
      const status = statusForSessionValidationCode(sessionResult.code);
      koaContext.status = status;
      if (status === 401) {
        koaContext.body = { code: 'unauthorized' };
        return;
      }
      if (sessionResult.code === 'session_verifier_not_configured') {
        koaContext.body = { code: 'session_verifier_not_configured' };
        return;
      }
      koaContext.body = { error: 'internal_error' };
      return;
    }
    const accountId = sessionResult.value;
    const entitlementsResult = await getEntitlementsForAccount(
      accountId,
      database,
    );
    if (entitlementsResult.ok === false) {
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
      return;
    }
    for (const entitlement of entitlementsResult.value) {
      if (isKnownEntitlementKey(entitlement.entitlementKey) === false) {
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
        return;
      }
    }
    const entitlements: Entitlement[] = entitlementsResult.value;
    koaContext.status = 200;
    koaContext.body = { entitlements };
  });
}
