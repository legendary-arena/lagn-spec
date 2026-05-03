/**
 * Owner Profile HTTP Routes — Server Layer (WP-104)
 *
 * Registers three owner-only HTTP endpoints under `/api/me/` on the
 * existing Koa router returned by boardgame.io's `Server({...})`
 * instance:
 *
 *   * `GET   /api/me/profile` — read the authenticated owner's view
 *   * `PATCH /api/me/profile` — sparse partial update per D-10406
 *   * `PUT   /api/me/links`   — replace-all-by-list per D-10407
 *
 * Mirrors the WP-115 `leaderboard.routes.ts` / WP-102
 * `profile.routes.ts` structural shape: local `KoaRouter` /
 * `KoaContext` interfaces (no direct `@koa/router` import — the
 * router type reaches us structurally), `try/catch` around any
 * database call so an uncaught throw becomes a typed 500, status +
 * body + Cache-Control header set on every response path.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only
 * through the supplied `DatabaseClient` parameter; the
 * `requireAuthenticatedSession` provider, `verifier`, and
 * `accountResolver` are caller-injected per the WP-101 / WP-102
 * / WP-104 / WP-115 caller-injected pattern (D-10408 same-commit
 * wiring).
 *
 * Status code mapping: every `SessionValidationErrorCode` from
 * `requireAuthenticatedSession` is mapped to its locked HTTP
 * status per the WP-104 §Non-Negotiable Constraints table.
 * `'unknown_account'` returns HTTP 401 (NOT 403) per the
 * account-existence-probe defense locked in WP-104.
 *
 * Authority: WP-104 §Scope (In) §E; EC-128 §2 + §3; D-10406
 * (PATCH semantics); D-10407 (PUT semantics); D-10408 (route-
 * wiring posture); D-11202 (bearer header); D-11204 (fail-closed
 * unconfigured-default); WP-115 D-11504 (Cache-Control first-
 * statement lock).
 */

import type {
  AccountId,
  AccountResolver,
  DatabaseClient,
  OwnerLinkInput,
  OwnerProfilePatch,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from './ownerProfile.types.js';
import {
  getOwnerProfile,
  replaceOwnerLinks,
  upsertOwnerProfile,
} from './ownerProfile.logic.js';

/**
 * Closed-set re-statement of the orchestrator's
 * `Result<AccountId, SessionValidationErrorCode>` shape (declared
 * locally so this file does not import from
 * `../identity/identity.types.js` for a type already re-exported
 * via `./ownerProfile.types.js`). The `Result.fail` branch carries
 * a `code` value that is dispatched against the locked WP-104
 * status-code mapping table inside each handler.
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
 * Caller-injected dependency bundle for
 * `registerOwnerProfileRoutes`. The `requireAuthenticatedSession`
 * provider is the WP-112 orchestrator (or a test fake); `verifier`
 * and `accountResolver` are the broker-specific implementations
 * passed through to the orchestrator at request time. Production
 * wiring binds these once at startup; until WP-126 lands, both
 * are `undefined` and the orchestrator returns
 * `Result.fail({ code: 'session_verifier_not_configured' })` per
 * D-11204 fail-closed posture.
 */
export interface OwnerProfileRouteDependencies {
  readonly requireAuthenticatedSession: (
    req: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
}

/**
 * Minimal structural shape of the Koa context surface this module
 * touches. Mirrors the WP-115 `KoaLeaderboardContext` precedent.
 * Declared locally rather than imported from `@koa/router` so
 * `apps/server/package.json` does not need a direct
 * `@koa/router` dependency — `@koa/router` reaches us as a
 * transitive of `boardgame.io/server`.
 */
interface KoaOwnerProfileContext {
  readonly req: SessionTokenRequest;
  request: { body?: unknown };
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

/**
 * Minimal structural shape of the Koa router surface this module
 * touches. Matches the `@koa/router` `Router#get` / `#patch` /
 * `#put` signatures for the three registration sites below.
 */
interface KoaRouter {
  get(
    path: string,
    handler: (koaContext: KoaOwnerProfileContext) => Promise<void> | void,
  ): unknown;
  patch(
    path: string,
    handler: (koaContext: KoaOwnerProfileContext) => Promise<void> | void,
  ): unknown;
  put(
    path: string,
    handler: (koaContext: KoaOwnerProfileContext) => Promise<void> | void,
  ): unknown;
}

/**
 * Map a `SessionValidationErrorCode` to the locked HTTP status per
 * WP-104 §Non-Negotiable Constraints. `'unknown_account'` returns
 * 401 (NOT 403) per the account-existence-probe defense.
 *
 * `'session_verifier_not_configured'` and `'lookup_failed'` return
 * 500 (operator-facing; production wiring is incomplete or the
 * database is faulting); every other code returns 401.
 */
function statusForSessionValidationCode(code: SessionValidationCode): number {
  if (
    code === 'session_verifier_not_configured' ||
    code === 'lookup_failed'
  ) {
    return 500;
  }
  return 401;
}

// why: this module is a thin Koa adapter — all owner-profile
// composition / mutation logic lives in `ownerProfile.logic.ts` so
// it is independently testable via `node:test` without spinning up
// boardgame.io's `Server()` or any HTTP listener. Every handler
// invokes `requireAuthenticatedSession` as the FIRST business-
// logic step before any DB query; on any orchestrator
// `Result.fail`, the handler returns the locked HTTP status with
// a typed `{ error: <code> }` body shape (mirrors WP-102
// `{ error: 'player_not_found' }` precedent verbatim). The
// `requireAuthenticatedSession` provider is caller-injected per
// the WP-101 / WP-102 / WP-104 / WP-115 pattern, so tests inject
// fakes without touching the orchestrator's broker seam. Per
// D-11202 the auth carrier is the bearer header only — no cookie
// path, no CSRF middleware, no WebSocket carrier in this WP.
/**
 * Register the three owner-only profile routes on the supplied Koa
 * router. The router is mutated in place; the function returns
 * `void`. Production callers in `apps/server/src/server.mjs` pass
 * the Koa router obtained from `boardgame.io`'s `Server({...})`
 * (`server.router`), the long-lived `pg.Pool` constructed via
 * `createPool()`, and the dependency bundle including the WP-112
 * `requireAuthenticatedSession` orchestrator.
 *
 * The orchestrator itself is broker-agnostic (per WP-112 D-11201);
 * `verifier` + `accountResolver` are passed into the orchestrator
 * at request time. Until WP-126 supplies a real `SessionVerifier`,
 * `verifier` is `undefined` and every authenticated request
 * returns 500 with `code: 'session_verifier_not_configured'`
 * (D-11204 fail-closed posture).
 */
export function registerOwnerProfileRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: OwnerProfileRouteDependencies,
): void {
  // why: requireAuthenticatedSession is the first business-logic step in
  // every handler before any DB query. The caller-injected provider
  // pattern (WP-112 / D-11202) lets production wire the real orchestrator
  // and tests inject fakes; the orchestrator itself is broker-agnostic
  // (WP-112 §Scope (In) §B). A SessionValidationErrorCode emitted by the
  // orchestrator dispatches via the closed-set table in WP-104
  // §Non-Negotiable Constraints — 'unknown_account' returns 401 (NOT
  // 403) per the account-existence-probe defense.
  async function authenticate(
    koaContext: KoaOwnerProfileContext,
  ): Promise<AccountId | null> {
    const result = await deps.requireAuthenticatedSession(koaContext.req, {
      verifier: deps.verifier,
      accountResolver: deps.accountResolver,
      database,
    });
    if (result.ok === true) {
      return result.value;
    }
    koaContext.status = statusForSessionValidationCode(result.code);
    koaContext.body = { error: result.code };
    return null;
  }

  router.get('/api/me/profile', async (koaContext) => {
    // why: Cache-Control MUST be the first statement in every handler
    // body per WP-115 D-11504 lock so a thrown exception still leaves
    // the header set on the eventual 500 response — owner profile
    // responses must never be cached by an intermediate proxy.
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const result = await getOwnerProfile(accountId, database);
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      if (result.code === 'unknown_account') {
        koaContext.status = 401;
        koaContext.body = { error: 'unknown_account' };
        return;
      }
      // why: defensive — every other OwnerProfileErrorCode value
      // could only emerge from a future code change that misroutes a
      // validator failure into the GET path. The 500 envelope keeps
      // the failure observable without leaking which code surfaced.
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    } catch (caughtError) {
      // why: never re-throw to a global Koa handler — the existing
      // server has no error middleware beyond boardgame.io defaults
      // and an uncaught throw here would surface as a 500 without a
      // body. The caught value is intentionally discarded because
      // the 500 envelope is locked at `{ error: 'internal_error' }`.
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.patch('/api/me/profile', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const result = await upsertOwnerProfile(
        accountId,
        rawBody as OwnerProfilePatch,
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      if (result.code === 'unknown_account') {
        koaContext.status = 401;
        koaContext.body = { error: 'unknown_account' };
        return;
      }
      // remaining OwnerProfileErrorCode values map to 400
      koaContext.status = 400;
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.put('/api/me/links', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const linksField = (rawBody as { links?: unknown }).links;
      if (Array.isArray(linksField) === false) {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const result = await replaceOwnerLinks(
        accountId,
        linksField as readonly OwnerLinkInput[],
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      if (result.code === 'unknown_account') {
        koaContext.status = 401;
        koaContext.body = { error: 'unknown_account' };
        return;
      }
      koaContext.status = 400;
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });
}
