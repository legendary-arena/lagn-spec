/**
 * Public Leaderboard HTTP Routes — Server Layer (WP-115)
 *
 * Registers three public, anonymous, read-only HTTP endpoints under
 * `/api/leaderboards/*` on the existing Koa router returned by
 * boardgame.io's `Server({...})` instance. Mirrors the structural
 * shape of `apps/server/src/profile/profile.routes.ts` (WP-102)
 * verbatim: local `KoaRouter` / `KoaLeaderboardContext` interfaces
 * (no direct `@koa/router` import — the router type reaches us
 * structurally), `try/catch` swallowing `void caughtError;`, status
 * + body + header assignments, no global error middleware.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only
 * through the supplied `Pool` parameter; the PAR gate is reached
 * only through the bound 1-arg `parGate.checkParPublished` form
 * exposed by `apps/server/src/par/parGate.mjs`. WP-054's
 * `leaderboard.logic.ts` is imported for production routing; tests
 * may swap that import via the optional `leaderboardLogic?` 4th
 * parameter (per WP-115 v1.1 reviewer Patch 3).
 *
 * Authority: WP-115 §Scope (In) §B; EC-119 §Locked Values; WP-102
 * §H + D-10202 (route-adapter pattern; profile-route wiring stays
 * deferred); D-5201 (sensitive fields stripped at the WP-054 layer
 * — never re-introduced here); D-115NN (Cache-Control v1 lock,
 * status-code domain, error-envelope shapes, explicit deps
 * injection).
 */

import type { Pool } from 'pg';
import {
  getGlobalTopLeaderboard,
  getPublicScoreByReplayHash,
  getScenarioLeaderboard,
  getThemeLeaderboard,
  listScenarioKeys,
} from './leaderboard.logic.js';
import type {
  GlobalTopLeaderboard,
  GlobalTopLeaderboardQueryOptions,
  LeaderboardQueryOptions,
  PublicLeaderboardEntry,
  ScenarioLeaderboard,
  ThemeLeaderboard,
  ThemeLeaderboardQueryOptions,
} from './leaderboard.types.js';

/**
 * Minimal structural shape of the PAR gate surface this module
 * touches. Mirrors the JSDoc typedef at
 * `apps/server/src/par/parGate.mjs:32-47` (the bound 1-arg curried
 * form returned by `createParGate(...)`); we re-state the shape
 * locally rather than import the JSDoc typedef so this file does
 * not couple to the `.mjs` typing surface (mirrors WP-054
 * `LeaderboardDependencies` precedent at
 * `leaderboard.types.ts:44-49`).
 */
interface ParGateHit {
  readonly parValue: number;
  readonly parVersion: string;
  readonly source: 'simulation' | 'seed';
  readonly scoringConfig: unknown;
}

// why: the route layer accepts the bound parGate plus an optional
// `getScenarioKeysForTheme` binding alongside it (per D-15002 —
// single deps bundle, not a separate fourth `themeGate` parameter).
// Production wiring in `server.mjs` constructs the themeId →
// scenarioKey[] map from the startup-loaded `content/themes/*.json`
// set using the engine's `buildScenarioKey` helper (D-15001) and
// passes the bound function here. When the binding is omitted
// (test fixtures, future callers that wire only the per-scenario
// routes), the theme route surfaces the locked 404 by construction.
interface ParGate {
  readonly checkParPublished: (scenarioKey: string) => ParGateHit | null;
  readonly getScenarioKeysForTheme?: (
    themeId: string,
  ) => readonly string[] | null;
}

/**
 * Minimal structural shape of the Koa context surface this module
 * touches. Declared locally rather than imported from `@koa/router`
 * so `apps/server/package.json` does not need a direct
 * `@koa/router` dependency — `@koa/router` reaches us as a
 * transitive of `boardgame.io/server`, and structural typing
 * matches the `registerHealthRoute(router)` precedent at
 * `apps/server/src/server.mjs:30-34` and the WP-102
 * `KoaProfileContext` precedent at
 * `apps/server/src/profile/profile.routes.ts:45-49`.
 */
interface KoaLeaderboardContext {
  params: { scenarioKey?: string; replayHash?: string; themeId?: string };
  query: Record<string, string | string[] | undefined>;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

/**
 * Minimal structural shape of the Koa router surface this module
 * touches. Matches the `@koa/router` `Router#get` signature for
 * the three registration sites below.
 */
interface KoaRouter {
  get(
    path: string,
    handler: (koaContext: KoaLeaderboardContext) => Promise<void> | void,
  ): unknown;
}

/**
 * Test-only injection seam (added in WP-115 v1.1 per reviewer Patch
 * 3): production callers omit the 4th parameter and the handler
 * resolves to the imported WP-054 functions; tests pass a fake
 * `LeaderboardLogic` whose three methods return canned results,
 * sidestepping any need to mock WP-054's SQL row shapes. The shape
 * is the function-typed projection of the three WP-054 exports;
 * any divergence here from `leaderboard.logic.ts` is FAIL.
 */
export interface LeaderboardLogic {
  readonly listScenarioKeys: typeof listScenarioKeys;
  readonly getScenarioLeaderboard: typeof getScenarioLeaderboard;
  readonly getPublicScoreByReplayHash: typeof getPublicScoreByReplayHash;
  readonly getThemeLeaderboard: typeof getThemeLeaderboard;
  readonly getGlobalTopLeaderboard: typeof getGlobalTopLeaderboard;
}

const PRODUCTION_LEADERBOARD_LOGIC: LeaderboardLogic = {
  listScenarioKeys,
  getScenarioLeaderboard,
  getPublicScoreByReplayHash,
  getThemeLeaderboard,
  getGlobalTopLeaderboard,
};

/**
 * Locked pagination bounds for `GET /api/leaderboards/scenarios/:scenarioKey`.
 * Out-of-range or non-integer values yield `400` with the locked
 * envelope. Maxima bound a single response payload and prevent
 * unbounded scans; they are not load guarantees.
 */
const PAGINATION_LIMIT_DEFAULT = 25;
const PAGINATION_LIMIT_MIN = 1;
const PAGINATION_LIMIT_MAX = 100;
const PAGINATION_OFFSET_DEFAULT = 0;
const PAGINATION_OFFSET_MIN = 0;
const PAGINATION_OFFSET_MAX = 10000;

interface PaginationParseSuccess {
  readonly ok: true;
  readonly limit: number;
  readonly offset: number;
}

interface PaginationParseFailure {
  readonly ok: false;
  readonly message: string;
}

type PaginationParseResult = PaginationParseSuccess | PaginationParseFailure;

/**
 * Coerces a single Koa query-parameter value (which Koa surfaces as
 * `string | string[] | undefined`) to `string | undefined` per the
 * v1.1 array-value policy (Patch 5): arrays of length 1 are treated
 * as that single value; arrays of any other length and missing
 * values are flagged so the caller can return the locked
 * `invalid_query` 400. Returning `null` here means "reject this
 * value as a multi-valued array"; returning `undefined` means
 * "value not supplied" (the caller may apply a default).
 */
function coerceSingleQueryValue(
  value: string | string[] | undefined,
): { ok: true; value: string | undefined } | { ok: false } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value === 'string') {
    return { ok: true, value };
  }
  if (Array.isArray(value) && value.length === 1) {
    return { ok: true, value: value[0] };
  }
  return { ok: false };
}

/**
 * Parses a single integer pagination parameter (`limit` or
 * `offset`) from the raw Koa query string. Applies the locked
 * default when the value is absent; rejects non-integer / out-of-
 * range values with a full-sentence message. Pure helper —
 * deterministic, side-effect free, no I/O. Used by
 * `parsePaginationQuery`.
 */
function parseSinglePaginationField(
  rawValue: string | undefined,
  fieldName: 'limit' | 'offset',
  defaultValue: number,
  minValue: number,
  maxValue: number,
): { ok: true; value: number } | { ok: false; message: string } {
  if (rawValue === undefined) {
    return { ok: true, value: defaultValue };
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) {
    return {
      ok: false,
      message: `Query parameter '${fieldName}' must be an integer.`,
    };
  }
  if (parsed < minValue || parsed > maxValue) {
    return {
      ok: false,
      message: `Query parameter '${fieldName}' must be between ${minValue} and ${maxValue} inclusive.`,
    };
  }
  return { ok: true, value: parsed };
}

/**
 * Parses the `limit` and `offset` query parameters for the
 * scenario-leaderboard handler. Returns the parsed pair on success
 * or a structured failure with a full-sentence message on any
 * rejection. Precedence: if both are invalid, returns the first
 * detected error (limit before offset); ordering is not user-
 * significant and tests must not assume a specific ordering.
 *
 * Pure helper — file-local. Exercised end-to-end by the colocated
 * test file via test #5's eight sub-assertions covering pagination
 * + array-value + path-param rejection paths.
 */
function parsePaginationQuery(
  query: Record<string, string | string[] | undefined>,
): PaginationParseResult {
  const limitCoerced = coerceSingleQueryValue(query.limit);
  if (limitCoerced.ok === false) {
    return {
      ok: false,
      message: "Query parameter 'limit' must be a single integer.",
    };
  }
  const offsetCoerced = coerceSingleQueryValue(query.offset);
  if (offsetCoerced.ok === false) {
    return {
      ok: false,
      message: "Query parameter 'offset' must be a single integer.",
    };
  }

  const limitParsed = parseSinglePaginationField(
    limitCoerced.value,
    'limit',
    PAGINATION_LIMIT_DEFAULT,
    PAGINATION_LIMIT_MIN,
    PAGINATION_LIMIT_MAX,
  );
  if (limitParsed.ok === false) {
    return { ok: false, message: limitParsed.message };
  }

  const offsetParsed = parseSinglePaginationField(
    offsetCoerced.value,
    'offset',
    PAGINATION_OFFSET_DEFAULT,
    PAGINATION_OFFSET_MIN,
    PAGINATION_OFFSET_MAX,
  );
  if (offsetParsed.ok === false) {
    return { ok: false, message: offsetParsed.message };
  }

  return { ok: true, limit: limitParsed.value, offset: offsetParsed.value };
}

// why: this module is a thin Koa adapter — all leaderboard logic
// lives in `leaderboard.logic.ts` per WP-054 §Lifecycle Prohibition.
// The route layer parses query strings, validates path parameters,
// applies status codes, sets the locked `Cache-Control: no-store`
// header on every response, and serializes the locked error
// envelopes; nothing else. Sensitive fields (`accountId`,
// `submissionId`, `email`, `authProvider`, `authProviderId`,
// `stateHash`, `scoreBreakdown`) are stripped at the WP-054 type
// boundary (`PublicLeaderboardEntry`) and are never re-introduced
// here.
/**
 * Register the three public leaderboard routes on the supplied Koa
 * router. The router is mutated in place; the function returns
 * `void`. Production callers in `apps/server/src/server.mjs` pass
 * the Koa router obtained from `boardgame.io`'s `Server({...})`
 * (`server.router`), the long-lived `pg.Pool` constructed via
 * `createPool()`, and the bound `parGate` from `createParGate(...)`.
 *
 * The optional `leaderboardLogic?` 4th parameter is a test-only
 * injection seam (per WP-115 v1.1 reviewer Patch 3); production
 * callers omit it and the handler resolves to the imported WP-054
 * functions. Tests pass a fake `LeaderboardLogic` whose three
 * methods return canned results, sidestepping WP-054 SQL-shape
 * mocking entirely — future WP-054 internal SQL changes do not
 * churn this file's tests.
 */
// why: the optional `leaderboardLogic?` parameter keeps the route
// layer's transport contract (status codes, envelopes, headers,
// pagination parsing) testable in isolation from WP-054's SQL
// contract. Reviewer Patch 3 (2026-05-01) introduced the seam
// after the v1.0 draft's "no real DB" claim was found to require
// SQL-shape mocking that would be brittle to WP-054 internal
// changes. Default value is the imported binding so production
// callers continue to call `registerLeaderboardRoutes(router,
// pool, parGate)` with three args unchanged.
export function registerLeaderboardRoutes(
  router: KoaRouter,
  database: Pool,
  parGate: ParGate,
  leaderboardLogic: LeaderboardLogic = PRODUCTION_LEADERBOARD_LOGIC,
): void {
  // why: exposing the canonical scenario-key list lets a leaderboard
  // UI render a scenario picker without duplicating registry
  // contents in the client bundle. The discoverability seam is
  // intentionally permissive — every scenario with at least one
  // publicly visible verified score appears here, regardless of
  // PAR-publication state; PAR filtering is a per-scenario concern
  // owned by handler 2 below.
  router.get(
    '/api/leaderboards/scenarios',
    async (koaContext) => {
      // why: Cache-Control MUST be the first statement in every
      // handler body (per WP-115 v1.1 Patch 8) so a thrown
      // exception in the WP-054 call still leaves the header set
      // on the eventual 500 response — the caching contract is
      // "no-store on every response, including error paths," not
      // "no-store on success paths."
      koaContext.set('Cache-Control', 'no-store');
      try {
        const scenarioKeys = await leaderboardLogic.listScenarioKeys(database);
        koaContext.status = 200;
        koaContext.body = { scenarioKeys };
      } catch (caughtError) {
        // why: never re-throw to a global Koa handler — the
        // existing server has no error middleware beyond
        // boardgame.io defaults and an uncaught throw here would
        // surface as a 500 without a body, which leaks "did the
        // handler even run?" to the client. The caught value is
        // intentionally discarded because the 500 envelope is
        // locked at `{ "error": "internal_error" }` — no stack
        // trace, no SQL state, no exception text per D-5201.
        // Future observability work may attach a logger via the
        // structural router parameter without changing this
        // surface.
        void caughtError;
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
      }
    },
  );

  router.get(
    '/api/leaderboards/scenarios/:scenarioKey',
    async (koaContext) => {
      koaContext.set('Cache-Control', 'no-store');
      const scenarioKey = koaContext.params.scenarioKey;
      // why: path-parameter validation is a transport-level shape
      // check (per WP-115 v1.1 Patch 4), not WP-054 logic. Routing
      // a missing or empty `:scenarioKey` to the WP-054 helper
      // would surface as a 500 from the SQL layer instead of the
      // locked 400 envelope; validation here keeps the error
      // surface deterministic and the helper input contract
      // honest.
      if (scenarioKey === undefined || scenarioKey === '') {
        koaContext.status = 400;
        koaContext.body = {
          error: 'invalid_query',
          message: 'Scenario key is required.',
        };
        return;
      }

      const pagination = parsePaginationQuery(koaContext.query);
      if (pagination.ok === false) {
        koaContext.status = 400;
        koaContext.body = {
          error: 'invalid_query',
          message: pagination.message,
        };
        return;
      }

      try {
        const options: LeaderboardQueryOptions = {
          scenarioKey,
          limit: pagination.limit,
          offset: pagination.offset,
        };
        // why: explicit `deps: { checkParPublished: parGate.checkParPublished }`
        // injection — relying on WP-054's `PRODUCTION_DEPENDENCIES`
        // default fail-closes every scenario response to an empty
        // leaderboard by design (its `checkParPublished` returns
        // `null`). The wiring layer must bind the real PAR gate at
        // every call site.
        const leaderboard: ScenarioLeaderboard = await leaderboardLogic.getScenarioLeaderboard(
          options,
          database,
          { checkParPublished: parGate.checkParPublished },
        );
        koaContext.status = 200;
        koaContext.body = leaderboard;
      } catch (caughtError) {
        void caughtError;
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
      }
    },
  );

  router.get(
    '/api/leaderboards/scores/:replayHash',
    async (koaContext) => {
      koaContext.set('Cache-Control', 'no-store');
      const replayHash = koaContext.params.replayHash;
      if (replayHash === undefined || replayHash === '') {
        koaContext.status = 400;
        koaContext.body = {
          error: 'invalid_query',
          message: 'Replay hash is required.',
        };
        return;
      }

      try {
        const entry: PublicLeaderboardEntry | null = await leaderboardLogic.getPublicScoreByReplayHash(
          replayHash,
          database,
        );
        if (entry === null) {
          koaContext.status = 404;
          koaContext.body = { error: 'score_not_found' };
          return;
        }
        koaContext.status = 200;
        koaContext.body = entry;
      } catch (caughtError) {
        void caughtError;
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
      }
    },
  );

  router.get(
    '/api/leaderboards/themes/:themeId',
    async (koaContext) => {
      // why: Cache-Control MUST be the first statement in every
      // handler body (per WP-115 v1.1 Patch 8) so a thrown
      // exception in the logic call still leaves the header set on
      // the eventual 500 — the caching contract is "no-store on
      // every response, including error paths."
      koaContext.set('Cache-Control', 'no-store');
      const themeId = koaContext.params.themeId;
      // why: path-parameter validation is a transport-level shape
      // check (mirrors the WP-115 Patch 4 precedent at the
      // per-scenario route). Routing a missing or empty `:themeId`
      // to the logic helper would surface a 404 instead of the
      // locked 400 envelope; validation here keeps the error
      // surface deterministic.
      if (themeId === undefined || themeId === '') {
        koaContext.status = 400;
        koaContext.body = {
          error: 'invalid_query',
          message: 'Theme id is required.',
        };
        return;
      }

      const pagination = parsePaginationQuery(koaContext.query);
      if (pagination.ok === false) {
        koaContext.status = 400;
        koaContext.body = {
          error: 'invalid_query',
          message: pagination.message,
        };
        return;
      }

      try {
        const options: ThemeLeaderboardQueryOptions = {
          themeId,
          limit: pagination.limit,
          offset: pagination.offset,
        };
        // why: explicit deps injection forwards BOTH the bound
        // checkParPublished AND the bound getScenarioKeysForTheme
        // per D-15002. Relying on the logic-layer
        // PRODUCTION_DEPENDENCIES default fail-closes every theme
        // response to 404 (its `getScenarioKeysForTheme` returns
        // `null`); the wiring layer must bind both functions at
        // every call site.
        const themeLeaderboard: ThemeLeaderboard | null =
          await leaderboardLogic.getThemeLeaderboard(options, database, {
            checkParPublished: parGate.checkParPublished,
            getScenarioKeysForTheme: parGate.getScenarioKeysForTheme,
          });
        if (themeLeaderboard === null) {
          koaContext.status = 404;
          koaContext.body = { error: 'theme_not_found' };
          return;
        }
        koaContext.status = 200;
        koaContext.body = themeLeaderboard;
      } catch (caughtError) {
        // why: discard the caught value — the 500 envelope is
        // locked at `{ error: 'internal_error' }`; no stack
        // trace, no SQL state, no exception text per D-5201.
        // Mirrors the per-scenario handler at lines 389-393.
        void caughtError;
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
      }
    },
  );

  router.get(
    '/api/leaderboards/top',
    async (koaContext) => {
      koaContext.set('Cache-Control', 'no-store');
      const pagination = parsePaginationQuery(koaContext.query);
      if (pagination.ok === false) {
        koaContext.status = 400;
        koaContext.body = {
          error: 'invalid_query',
          message: pagination.message,
        };
        return;
      }

      try {
        const options: GlobalTopLeaderboardQueryOptions = {
          limit: pagination.limit,
          offset: pagination.offset,
        };
        // why: same deps wiring as the theme route — the global
        // Top-N derives PAR-eligibility per scenario via the same
        // injected `checkParPublished` (D-15003 step 2). The
        // `getScenarioKeysForTheme` field is included for shape
        // uniformity even though this endpoint does not consult it.
        const globalTopLeaderboard: GlobalTopLeaderboard =
          await leaderboardLogic.getGlobalTopLeaderboard(options, database, {
            checkParPublished: parGate.checkParPublished,
            getScenarioKeysForTheme: parGate.getScenarioKeysForTheme,
          });
        koaContext.status = 200;
        koaContext.body = globalTopLeaderboard;
      } catch (caughtError) {
        void caughtError;
        koaContext.status = 500;
        koaContext.body = { error: 'internal_error' };
      }
    },
  );
}
