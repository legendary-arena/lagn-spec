/**
 * Admin Profile HTTP Routes — Server Layer (WP-107)
 *
 * Registers three admin-only HTTP endpoints under `/api/admin/players/`
 * on the existing Koa router returned by boardgame.io's `Server({...})`
 * instance:
 *
 *   * `GET  /api/admin/players/:handle/integrity` — read integrity view
 *   * `POST /api/admin/players/:handle/suspend`   — set is_suspended=TRUE
 *   * `POST /api/admin/players/:handle/unsuspend` — set is_suspended=FALSE
 *
 * Every route gates authorization via `requireAdminSession` as the FIRST
 * statement in the handler body (after `Cache-Control: no-store`, which
 * is required to land BEFORE any throwable per the WP-115 D-11504 lock).
 * No inline `is_admin` check is permitted; the WP-159 contract is the
 * sole authorization site for admin-attribution.
 *
 * Mirrors the WP-104 / WP-110 / WP-115 structural shape: local
 * `KoaRouter` / `KoaContext` interfaces (no direct `@koa/router`
 * import — the router type reaches us structurally), `try / catch`
 * around any DB / logic call so an uncaught throw becomes a typed 500,
 * status + body + `Cache-Control` header set on every response path.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only through
 * the supplied `DatabaseClient` parameter; the
 * `requireAdminSession` provider, `verifier`, and `accountResolver`
 * are caller-injected per the WP-101 / WP-102 / WP-104 / WP-115 /
 * WP-110 caller-injected pattern (WP-104 D-10408 same-commit wiring).
 *
 * Status code mapping (locked per WP-107 §Locked contract values):
 *
 *   `requireAdminSession` -> `'unauthorized'`  -> HTTP 401
 *                          -> `'forbidden'`     -> HTTP 403
 *                          -> `'lookup_failed'` -> HTTP 500
 *   handle not found                            -> HTTP 404
 *   reason validation fail                      -> HTTP 400
 *   self-action (acting === target)             -> HTTP 400
 *   logic-layer `'internal_error'`              -> HTTP 500
 *
 * Transaction discipline: this file contains zero transaction-control
 * literals (no transaction-open / commit / rollback keywords). The
 * logic layer (`adminProfile.logic.ts`) owns transaction lifecycle;
 * routes pass `database` in and dispatch on the returned `Result`.
 *
 * Authority: WP-107 §Scope (In) §E; EC-195 §Files to Produce + §Guardrails;
 * D-10701 (account-level scope); D-10702 (audit log append-only
 * single-table); D-10703 (handle in URL, not accountId); WP-115
 * D-11504 (Cache-Control first-statement lock); WP-104 D-10408
 * (route-wiring posture).
 */

import type {
  AccountId,
  DatabaseClient,
} from '../../identity/identity.types.js';
import type {
  AdminActionRequest,
} from './adminProfile.types.js';
import {
  getAdminProfileView,
  resolveHandleToAccountId,
  suspendPlayer,
  unsuspendPlayer,
} from './adminProfile.logic.js';
import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../../auth/sessionToken.types.js';
import type { AdminSessionResult } from '../../auth/adminSession.js';

/**
 * Caller-injected dependency bundle for `registerAdminProfileRoutes`.
 * The `requireAdminSession` provider is the WP-159 helper (or a test
 * fake); `verifier` and `accountResolver` are the broker-specific
 * implementations passed through to the underlying WP-112
 * orchestrator at request time. Production wiring binds these once at
 * startup; until WP-126 lands a real verifier, both are `undefined`
 * and `requireAdminSession` returns
 * `'unauthorized'` -> HTTP 401 (per the upstream
 * `'session_verifier_not_configured'` -> `'unauthorized'` collapse
 * locked in WP-159 §A).
 */
export interface AdminProfileRouteDependencies {
  readonly requireAdminSession: (
    request: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<AdminSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
}

/**
 * Minimal structural shape of the Koa context surface this module
 * touches. Mirrors the WP-104 `KoaOwnerProfileContext` precedent.
 */
interface KoaAdminProfileContext {
  readonly req: SessionTokenRequest;
  request: { body?: unknown };
  params: { handle?: string };
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

/**
 * Minimal structural shape of the Koa router surface this module
 * touches. Matches the `@koa/router` `Router#get` / `#post`
 * signatures for the three registration sites below.
 */
interface KoaRouter {
  get(
    path: string,
    handler: (koaContext: KoaAdminProfileContext) => Promise<void> | void,
  ): unknown;
  post(
    path: string,
    handler: (koaContext: KoaAdminProfileContext) => Promise<void> | void,
  ): unknown;
}

/**
 * Map an `AdminSessionResult` failure code to the locked HTTP status
 * per WP-107 §Locked contract values. `'unauthorized'` -> 401;
 * `'forbidden'` -> 403; `'lookup_failed'` -> 500.
 */
function statusForAdminSessionCode(
  code: 'unauthorized' | 'forbidden' | 'lookup_failed',
): number {
  if (code === 'unauthorized') {
    return 401;
  }
  if (code === 'forbidden') {
    return 403;
  }
  return 500;
}

/**
 * Map an `AdminProfileErrorCode` to the locked HTTP status per
 * WP-107 §Locked contract values. `'not_found'` -> 404;
 * `'invalid_request'` -> 400; `'internal_error'` -> 500. The
 * `'unauthorized'` / `'forbidden'` codes are dispatched by
 * `statusForAdminSessionCode` above; this mapping only fires after
 * authorization has succeeded.
 */
function statusForLogicCode(
  code: 'not_found' | 'invalid_request' | 'internal_error',
): number {
  if (code === 'not_found') {
    return 404;
  }
  if (code === 'invalid_request') {
    return 400;
  }
  return 500;
}

/**
 * Register the three admin-only profile routes on the supplied Koa
 * router. The router is mutated in place; the function returns `void`.
 * Production callers in `apps/server/src/server.mjs` pass the Koa
 * router obtained from `boardgame.io`'s `Server({...})`
 * (`server.router`), the long-lived `pg.Pool` constructed via
 * `createPool()`, and the dependency bundle including the WP-159
 * `requireAdminSession` helper.
 *
 * Until WP-126 supplies a real `SessionVerifier`, `verifier` is
 * `undefined` and every authenticated request returns 401 via the
 * `'unauthorized'` collapse path locked in WP-159 §A.
 */
export function registerAdminProfileRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: AdminProfileRouteDependencies,
): void {
  // why: requireAdminSession is the first business-logic step in every
  // handler before any DB query. The caller-injected provider pattern
  // (WP-159 / WP-112) lets production wire the real helper and tests
  // inject fakes; the helper itself composes the broker-agnostic
  // WP-112 orchestrator with a single-column read on
  // legendary.players.is_admin per D-15901 + D-15902. The result's
  // closed-union code dispatches via statusForAdminSessionCode above;
  // no inline `is_admin` check is permitted (the repo-wide grep gate
  // in WP-159 enforces adminSession.ts as the sole reader of the
  // is_admin column).
  async function authorize(
    koaContext: KoaAdminProfileContext,
  ): Promise<AccountId | null> {
    const result = await deps.requireAdminSession(koaContext.req, {
      verifier: deps.verifier,
      accountResolver: deps.accountResolver,
      database,
    });
    if (result.ok === true) {
      return result.accountId;
    }
    koaContext.status = statusForAdminSessionCode(result.code);
    koaContext.body = { code: result.code, reason: result.reason };
    return null;
  }

  router.get('/api/admin/players/:handle/integrity', async (koaContext) => {
    // why: Cache-Control MUST be the first statement in every handler
    // body per WP-115 D-11504 lock so a thrown exception still leaves
    // the header set on the eventual 500 response — admin integrity
    // responses must never be cached by an intermediate proxy.
    koaContext.set('Cache-Control', 'no-store');
    try {
      // why: requireAdminSession is invoked first because no inline
      // is_admin check is permitted (per WP-159 contract). The
      // returned AccountId is the acting admin; getAdminProfileView
      // does not need it (read-only path; no audit row written) but
      // requesting authorization first preserves the "no DB query
      // before authorization" invariant.
      const actingAccountId = await authorize(koaContext);
      if (actingAccountId === null) {
        return;
      }
      const handle = koaContext.params.handle;
      if (typeof handle !== 'string' || handle.length === 0) {
        koaContext.status = 400;
        koaContext.body = {
          code: 'invalid_request',
          reason: 'Path parameter ":handle" must be a non-empty string.',
        };
        return;
      }
      const result = await getAdminProfileView(database, handle);
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForLogicCode(result.code);
      koaContext.body = { code: result.code, reason: result.reason };
    } catch (caughtError) {
      // why: never re-throw to a global Koa handler — the existing
      // server has no error middleware beyond boardgame.io defaults
      // and an uncaught throw here would surface as a 500 without a
      // body. The caught value is intentionally discarded because
      // the 500 envelope is locked at { code: 'internal_error' }.
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'internal_error' };
    }
  });

  router.post('/api/admin/players/:handle/suspend', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const actingAccountId = await authorize(koaContext);
      if (actingAccountId === null) {
        return;
      }
      const handle = koaContext.params.handle;
      if (typeof handle !== 'string' || handle.length === 0) {
        koaContext.status = 400;
        koaContext.body = {
          code: 'invalid_request',
          reason: 'Path parameter ":handle" must be a non-empty string.',
        };
        return;
      }
      const targetAccountId = await resolveHandleToAccountId(database, handle);
      if (targetAccountId === null) {
        koaContext.status = 404;
        koaContext.body = {
          code: 'not_found',
          reason: `No legendary.players row matches the supplied handle "${handle}".`,
        };
        return;
      }
      // why: self-action guard at the route layer so zero DB work
      // happens for self-action attempts AND zero audit rows are
      // written for the rejected path. Per WP-107 §Locked contract
      // values: 400 { code: 'invalid_request', reason: 'Admins
      // cannot suspend their own account.' }. The check applies to
      // BOTH /suspend AND /unsuspend (both routes use this guard
      // verbatim).
      if (actingAccountId === targetAccountId) {
        koaContext.status = 400;
        koaContext.body = {
          code: 'invalid_request',
          reason: 'Admins cannot suspend their own account.',
        };
        return;
      }
      const rawBody = koaContext.request.body;
      if (
        rawBody === undefined ||
        rawBody === null ||
        typeof rawBody !== 'object'
      ) {
        koaContext.status = 400;
        koaContext.body = {
          code: 'invalid_request',
          reason:
            'Request body must be a JSON object with a "reason" string field.',
        };
        return;
      }
      const rawReason = (rawBody as AdminActionRequest).reason;
      const result = await suspendPlayer(
        database,
        actingAccountId,
        targetAccountId,
        rawReason,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = { ok: true, actionId: result.value.actionId };
        return;
      }
      koaContext.status = statusForLogicCode(result.code);
      koaContext.body = { code: result.code, reason: result.reason };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'internal_error' };
    }
  });

  router.post('/api/admin/players/:handle/unsuspend', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const actingAccountId = await authorize(koaContext);
      if (actingAccountId === null) {
        return;
      }
      const handle = koaContext.params.handle;
      if (typeof handle !== 'string' || handle.length === 0) {
        koaContext.status = 400;
        koaContext.body = {
          code: 'invalid_request',
          reason: 'Path parameter ":handle" must be a non-empty string.',
        };
        return;
      }
      const targetAccountId = await resolveHandleToAccountId(database, handle);
      if (targetAccountId === null) {
        koaContext.status = 404;
        koaContext.body = {
          code: 'not_found',
          reason: `No legendary.players row matches the supplied handle "${handle}".`,
        };
        return;
      }
      // why: same self-action guard as /suspend — per WP-107 §Locked
      // contract values, "Admins cannot suspend their own account"
      // applies to BOTH mutations. Even though the operation here is
      // unsuspend, the policy reason locked verbatim is the
      // suspend-phrased sentence so both routes return the
      // identically-framed error.
      if (actingAccountId === targetAccountId) {
        koaContext.status = 400;
        koaContext.body = {
          code: 'invalid_request',
          reason: 'Admins cannot suspend their own account.',
        };
        return;
      }
      const rawBody = koaContext.request.body;
      if (
        rawBody === undefined ||
        rawBody === null ||
        typeof rawBody !== 'object'
      ) {
        koaContext.status = 400;
        koaContext.body = {
          code: 'invalid_request',
          reason:
            'Request body must be a JSON object with a "reason" string field.',
        };
        return;
      }
      const rawReason = (rawBody as AdminActionRequest).reason;
      const result = await unsuspendPlayer(
        database,
        actingAccountId,
        targetAccountId,
        rawReason,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = { ok: true, actionId: result.value.actionId };
        return;
      }
      koaContext.status = statusForLogicCode(result.code);
      koaContext.body = { code: result.code, reason: result.reason };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { code: 'internal_error' };
    }
  });
}
