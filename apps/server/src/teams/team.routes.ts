/**
 * Team Affiliation HTTP Routes — Server Layer (WP-109)
 *
 * Registers eight team-related HTTP endpoints under `/api/teams/` on
 * the existing Koa router returned by boardgame.io's `Server({...})`
 * instance:
 *
 *   * `POST   /api/teams`                          — create a team (caller becomes captain)
 *   * `GET    /api/teams/:teamId`                  — read a team (visibility-filtered)
 *   * `PATCH  /api/teams/:teamId`                  — captain-only metadata update
 *   * `POST   /api/teams/:teamId/members`          — captain-only member add
 *   * `PATCH  /api/teams/:teamId/members/:playerId`— captain-only role change (substitute → member)
 *   * `DELETE /api/teams/:teamId/members/:playerId`— captain or self leave
 *   * `PATCH  /api/teams/:teamId/captain`          — captain-only captain reassignment
 *   * `POST   /api/teams/:teamId/status`           — captain-only terminal-state transition
 *
 * Mirrors the WP-104 `ownerProfile.routes.ts` / WP-115
 * `leaderboard.routes.ts` structural shape: local `KoaRouter` /
 * `KoaContext` interfaces (no direct `@koa/router` import — the
 * router type reaches us structurally), `try/catch` around every
 * database call so an uncaught throw becomes a typed 500,
 * `Cache-Control: no-store` set as the FIRST statement on every
 * handler per WP-115 D-11504 lock.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only
 * through the supplied `DatabaseClient` parameter; the
 * `requireAuthenticatedSession` provider, `verifier`, and
 * `accountResolver` are caller-injected per the WP-101 / WP-102 /
 * WP-104 / WP-115 caller-injected pattern (D-10408 same-commit
 * wiring).
 *
 * Status code mapping (per EC-115 §Locked Values + Hard Stops 19,
 * 20): every `SessionValidationErrorCode` from
 * `requireAuthenticatedSession` is mapped to its locked HTTP
 * status; `'unknown_account'` returns HTTP 401 (NOT 403) per the
 * account-existence-probe defense (mirrors WP-104). Every
 * `TeamErrorCode` is mapped to its locked HTTP status;
 * `'team_not_visible'` returns HTTP 404 (NOT 403) to avoid leaking
 * team existence to viewers without permission.
 *
 * Authority: WP-109 §Files Expected to Change; EC-115 §Locked
 * Values; D-10408 (route-wiring posture); D-11202 (bearer header);
 * D-11204 (fail-closed unconfigured-default); WP-115 D-11504
 * (Cache-Control first-statement lock).
 */

import type {
  AccountId,
  AccountResolver,
  CreateTeamInput,
  DatabaseClient,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
  TeamErrorCode,
  TeamId,
} from './team.types.js';
import {
  createTeam,
  getTeam,
  promoteSubstitute,
  reassignCaptain,
  recordMemberAdd,
  recordMemberLeave,
  toTeamId,
  transitionTeamStatus,
  updateTeamMetadata,
} from './team.logic.js';

/**
 * Closed-set re-statement of the orchestrator's session-validation
 * Result shape (declared locally so this file does not import from
 * `../identity/identity.types.js` for a type already re-exported
 * via `./team.types.js`). The `Result.fail` branch carries a `code`
 * value that is dispatched against the locked WP-109 status-code
 * mapping table inside each handler.
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
 * Caller-injected dependency bundle for `registerTeamRoutes`. The
 * `requireAuthenticatedSession` provider is the WP-112 orchestrator
 * (or a test fake); `verifier` and `accountResolver` are the
 * broker-specific implementations passed through to the
 * orchestrator at request time. Production wiring binds these once
 * at startup; until WP-126 lands, both are `undefined` and the
 * orchestrator returns
 * `Result.fail({ code: 'session_verifier_not_configured' })` per
 * D-11204 fail-closed posture.
 */
export interface TeamRouteDependencies {
  readonly requireAuthenticatedSession: (
    req: SessionTokenRequest,
    options: RequireAuthenticatedSessionOptions,
  ) => Promise<RequireAuthenticatedSessionResult>;
  readonly verifier?: SessionVerifier;
  readonly accountResolver?: AccountResolver;
}

/**
 * Minimal structural shape of the Koa context surface this module
 * touches. Mirrors the WP-104 `KoaOwnerProfileContext` precedent.
 * Declared locally rather than imported from `@koa/router` so
 * `apps/server/package.json` does not need a direct
 * `@koa/router` dependency — `@koa/router` reaches us as a
 * transitive of `boardgame.io/server`.
 */
interface KoaTeamContext {
  readonly req: SessionTokenRequest;
  request: { body?: unknown };
  params: Record<string, string>;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

/**
 * Minimal structural shape of the Koa router surface this module
 * touches. Matches the `@koa/router` `Router#get` / `#post` /
 * `#patch` / `#delete` signatures for the eight registration sites
 * below.
 */
interface KoaRouter {
  get(
    path: string,
    handler: (koaContext: KoaTeamContext) => Promise<void> | void,
  ): unknown;
  post(
    path: string,
    handler: (koaContext: KoaTeamContext) => Promise<void> | void,
  ): unknown;
  patch(
    path: string,
    handler: (koaContext: KoaTeamContext) => Promise<void> | void,
  ): unknown;
  delete(
    path: string,
    handler: (koaContext: KoaTeamContext) => Promise<void> | void,
  ): unknown;
}

/**
 * Map a `SessionValidationErrorCode` to the locked HTTP status per
 * EC-115 §Locked Values. `'unknown_account'` returns 401 (NOT 403)
 * per the account-existence-probe defense (mirrors WP-104).
 * `'session_verifier_not_configured'` and `'lookup_failed'` return
 * 500 (operator-facing); every other code returns 401.
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

/**
 * Map a `TeamErrorCode` to its locked HTTP status per EC-115
 * §Locked Values. `'team_not_visible'` returns 404 (NOT 403) to
 * avoid leaking team existence to viewers without permission.
 * `'unknown_account'` returns 401 (NOT 403) per the same posture
 * as the session-validation map.
 */
function statusForTeamErrorCode(code: TeamErrorCode): number {
  switch (code) {
    case 'invalid_request':
    case 'invalid_team_size':
    case 'invalid_team_name':
    case 'invalid_cohort_label':
    case 'captain_must_be_member':
    case 'monotonic_violation':
      return 400;
    case 'unknown_account':
      return 401;
    case 'not_team_captain':
      return 403;
    case 'team_not_found':
    case 'team_not_visible':
      return 404;
    case 'roster_invalid':
    case 'duplicate_active_membership':
    case 'team_not_active':
      return 409;
    default:
      return 500;
  }
}

// why: this module is a thin Koa adapter — all team logic lives in
// `team.logic.ts` so it is independently testable via `node:test`
// without spinning up boardgame.io's `Server()` or any HTTP
// listener. Every authenticated handler invokes
// `requireAuthenticatedSession` as the FIRST business-logic step
// before any DB query; on any orchestrator `Result.fail`, the
// handler returns the locked HTTP status with a typed
// `{ error: <code> }` body shape (mirrors WP-104
// `{ error: 'unknown_account' }` precedent verbatim). The
// `requireAuthenticatedSession` provider is caller-injected per
// the WP-101 / WP-102 / WP-104 / WP-115 pattern, so tests inject
// fakes without touching the orchestrator's broker seam. Per
// D-11202 the auth carrier is the bearer header only — no cookie
// path, no CSRF middleware, no WebSocket carrier in this WP.
/**
 * Register the eight team-affiliation routes on the supplied Koa
 * router. The router is mutated in place; the function returns
 * `void`. Production callers in `apps/server/src/server.mjs` pass
 * the Koa router obtained from `boardgame.io`'s `Server({...})`
 * (`server.router`), the long-lived `pg.Pool` constructed via
 * `createPool()`, and the dependency bundle including the WP-112
 * `requireAuthenticatedSession` orchestrator.
 */
export function registerTeamRoutes(
  router: KoaRouter,
  database: DatabaseClient,
  deps: TeamRouteDependencies,
): void {
  // why: requireAuthenticatedSession is the first business-logic step
  // in every authenticated handler before any DB query. The
  // caller-injected provider pattern (WP-112 / D-11202) lets
  // production wire the real orchestrator and tests inject fakes;
  // the orchestrator itself is broker-agnostic (WP-112 §Scope (In)
  // §B). A SessionValidationErrorCode emitted by the orchestrator
  // dispatches via the closed-set table in EC-115 §Locked Values —
  // 'unknown_account' returns 401 (NOT 403) per the
  // account-existence-probe defense.
  async function authenticate(
    koaContext: KoaTeamContext,
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

  function parseTeamIdParam(
    koaContext: KoaTeamContext,
  ): TeamId | null {
    const raw = koaContext.params.teamId;
    const parseResult = toTeamId(raw);
    if (parseResult.ok === false) {
      koaContext.status = 400;
      koaContext.body = { error: 'invalid_request' };
      return null;
    }
    return parseResult.value;
  }

  router.post('/api/teams', async (koaContext) => {
    // why: Cache-Control MUST be the first statement in every handler
    // body per WP-115 D-11504 lock so a thrown exception still leaves
    // the header set on the eventual 500 response — team data must
    // never be cached by an intermediate proxy.
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
      const result = await createTeam(
        accountId,
        rawBody as CreateTeamInput,
        database,
      );
      if (result.ok === true) {
        koaContext.status = 201;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForTeamErrorCode(result.code);
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.get('/api/teams/:teamId', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const teamId = parseTeamIdParam(koaContext);
      if (teamId === null) {
        return;
      }
      const result = await getTeam(database, teamId);
      if (result.ok === false) {
        koaContext.status = statusForTeamErrorCode(result.code);
        koaContext.body = { error: result.code };
        return;
      }
      // why: visibility filter on the read path. 'public' teams are
      // visible to all (including unauthenticated readers).
      // 'friends' / 'private' teams require authentication AND
      // membership; the visibility-filter denial returns 404 (NOT
      // 403) per Hard Stop #20 to avoid leaking team existence.
      // Authentication is attempted but optional for 'public'
      // teams.
      const team = result.value;
      if (team.visibility === 'public') {
        koaContext.status = 200;
        koaContext.body = team;
        return;
      }
      // Non-public team — require authentication.
      const authResult = await deps.requireAuthenticatedSession(
        koaContext.req,
        {
          verifier: deps.verifier,
          accountResolver: deps.accountResolver,
          database,
        },
      );
      if (authResult.ok === false) {
        // For visibility-protected teams, treat any auth failure as
        // 404 to avoid leaking team existence (mirrors the
        // unknown_account-probe defense).
        koaContext.status = 404;
        koaContext.body = { error: 'team_not_visible' };
        return;
      }
      // Look up viewer player_id for membership check.
      const viewerLookup = await database.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
        [authResult.value],
      );
      if (viewerLookup.rows.length === 0) {
        koaContext.status = 404;
        koaContext.body = { error: 'team_not_visible' };
        return;
      }
      const viewerPlayerId =
        typeof viewerLookup.rows[0].player_id === 'string'
          ? viewerLookup.rows[0].player_id
          : String(viewerLookup.rows[0].player_id);
      const isMember = team.members.some(
        (member) => member.playerId === viewerPlayerId,
      );
      if (isMember === false) {
        // Team is 'friends' or 'private' and viewer is not a member.
        // Per OQ-1 fallback (no friend graph) + 'private' semantics,
        // hide the team. 404 (NOT 403) per Hard Stop #20.
        koaContext.status = 404;
        koaContext.body = { error: 'team_not_visible' };
        return;
      }
      koaContext.status = 200;
      koaContext.body = team;
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.patch('/api/teams/:teamId', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const teamId = parseTeamIdParam(koaContext);
      if (teamId === null) {
        return;
      }
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const captainCheck = await assertCallerIsCaptain(
        koaContext,
        database,
        teamId,
        accountId,
      );
      if (captainCheck === false) {
        return;
      }
      const result = await updateTeamMetadata(
        accountId,
        teamId,
        rawBody as { name?: string; visibility?: 'public' | 'friends' | 'private' },
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForTeamErrorCode(result.code);
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.post('/api/teams/:teamId/members', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const teamId = parseTeamIdParam(koaContext);
      if (teamId === null) {
        return;
      }
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const captainCheck = await assertCallerIsCaptain(
        koaContext,
        database,
        teamId,
        accountId,
      );
      if (captainCheck === false) {
        return;
      }
      const body = rawBody as { playerId?: unknown; role?: unknown };
      if (typeof body.playerId !== 'string' || body.playerId.length === 0) {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      if (body.role !== 'member' && body.role !== 'substitute') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const result = await recordMemberAdd(
        accountId,
        teamId,
        body.playerId,
        body.role,
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForTeamErrorCode(result.code);
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.patch('/api/teams/:teamId/members/:playerId', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const teamId = parseTeamIdParam(koaContext);
      if (teamId === null) {
        return;
      }
      const targetPlayerId = koaContext.params.playerId;
      if (typeof targetPlayerId !== 'string' || targetPlayerId.length === 0) {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const captainCheck = await assertCallerIsCaptain(
        koaContext,
        database,
        teamId,
        accountId,
      );
      if (captainCheck === false) {
        return;
      }
      // why: the only role-change path WP-109 supports is
      // substitute → member promotion (per §8.3 + EC-115 Guardrail
      // 4). Other role changes (member → substitute, etc.) are not
      // in scope.
      const result = await promoteSubstitute(
        accountId,
        teamId,
        targetPlayerId,
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForTeamErrorCode(result.code);
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.delete('/api/teams/:teamId/members/:playerId', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const teamId = parseTeamIdParam(koaContext);
      if (teamId === null) {
        return;
      }
      const targetPlayerId = koaContext.params.playerId;
      if (typeof targetPlayerId !== 'string' || targetPlayerId.length === 0) {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      // why: leave is permitted by either the captain (removing a
      // member) or the member themselves (self-leave). Both are
      // routed through recordMemberLeave; ownership of the target
      // playerId vs caller's playerId is the route-level
      // authorization check.
      const callerLookup = await database.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
        [accountId],
      );
      if (callerLookup.rows.length === 0) {
        koaContext.status = 401;
        koaContext.body = { error: 'unknown_account' };
        return;
      }
      const callerPlayerId =
        typeof callerLookup.rows[0].player_id === 'string'
          ? callerLookup.rows[0].player_id
          : String(callerLookup.rows[0].player_id);
      const isSelf = callerPlayerId === targetPlayerId;
      if (isSelf === false) {
        const captainCheck = await assertCallerIsCaptain(
          koaContext,
          database,
          teamId,
          accountId,
        );
        if (captainCheck === false) {
          return;
        }
      }
      const result = await recordMemberLeave(
        accountId,
        teamId,
        targetPlayerId,
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForTeamErrorCode(result.code);
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.patch('/api/teams/:teamId/captain', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const teamId = parseTeamIdParam(koaContext);
      if (teamId === null) {
        return;
      }
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const captainCheck = await assertCallerIsCaptain(
        koaContext,
        database,
        teamId,
        accountId,
      );
      if (captainCheck === false) {
        return;
      }
      const body = rawBody as { newCaptainPlayerId?: unknown };
      if (typeof body.newCaptainPlayerId !== 'string' || body.newCaptainPlayerId.length === 0) {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const result = await reassignCaptain(
        accountId,
        teamId,
        body.newCaptainPlayerId,
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForTeamErrorCode(result.code);
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });

  router.post('/api/teams/:teamId/status', async (koaContext) => {
    koaContext.set('Cache-Control', 'no-store');
    try {
      const accountId = await authenticate(koaContext);
      if (accountId === null) {
        return;
      }
      const teamId = parseTeamIdParam(koaContext);
      if (teamId === null) {
        return;
      }
      const rawBody = koaContext.request.body;
      if (rawBody === undefined || rawBody === null || typeof rawBody !== 'object') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const captainCheck = await assertCallerIsCaptain(
        koaContext,
        database,
        teamId,
        accountId,
      );
      if (captainCheck === false) {
        return;
      }
      const body = rawBody as { status?: unknown };
      if (body.status !== 'completed' && body.status !== 'retired') {
        koaContext.status = 400;
        koaContext.body = { error: 'invalid_request' };
        return;
      }
      const result = await transitionTeamStatus(
        accountId,
        teamId,
        body.status,
        database,
      );
      if (result.ok === true) {
        koaContext.status = 200;
        koaContext.body = result.value;
        return;
      }
      koaContext.status = statusForTeamErrorCode(result.code);
      koaContext.body = { error: result.code };
    } catch (caughtError) {
      void caughtError;
      koaContext.status = 500;
      koaContext.body = { error: 'internal_error' };
    }
  });
}

/**
 * Captain-only authorization helper. Loads the team, resolves the
 * caller's player_id, and confirms `captain_player_id ===
 * caller`. On failure, sets the koaContext status + body and
 * returns false; on success, returns true and the handler
 * proceeds.
 */
async function assertCallerIsCaptain(
  koaContext: KoaTeamContext,
  database: DatabaseClient,
  teamId: TeamId,
  callerAccountId: AccountId,
): Promise<boolean> {
  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    koaContext.status = statusForTeamErrorCode(teamResult.code);
    koaContext.body = { error: teamResult.code };
    return false;
  }
  const callerLookup = await database.query(
    'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
    [callerAccountId],
  );
  if (callerLookup.rows.length === 0) {
    koaContext.status = 401;
    koaContext.body = { error: 'unknown_account' };
    return false;
  }
  const callerPlayerId =
    typeof callerLookup.rows[0].player_id === 'string'
      ? callerLookup.rows[0].player_id
      : String(callerLookup.rows[0].player_id);
  if (teamResult.value.captainPlayerId !== callerPlayerId) {
    koaContext.status = 403;
    koaContext.body = { error: 'not_team_captain' };
    return false;
  }
  return true;
}
