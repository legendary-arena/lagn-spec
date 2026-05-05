/**
 * Legendary Arena -- boardgame.io Game Server
 *
 * Wiring layer: loads the card registry and rules, creates the boardgame.io
 * Server(), configures CORS, exposes a /health endpoint, and listens on the
 * configured port.
 *
 * This file must not contain game logic. It connects pieces -- it does not
 * decide what happens in the game.
 */

import { createRequire } from 'node:module';
import { createRegistryFromLocalFiles } from '@legendary-arena/registry';
import { loadRules, getRules } from './rules/loader.mjs';
import { createParGate } from './par/parGate.mjs';
import { createPool } from './db/database.js';
import { registerLeaderboardRoutes } from './leaderboards/leaderboard.routes.js';
import { registerOwnerProfileRoutes } from './profile/ownerProfile.routes.js';
import { registerTeamRoutes } from './teams/team.routes.js';
import { requireAuthenticatedSession } from './auth/sessionToken.logic.js';
import { createHankoSessionVerifier } from './auth/hanko/hankoVerifier.logic.js';
import { productionAccountResolver } from './auth/accountResolver.logic.js';
import { LegendaryGame, setRegistryForSetup } from '@legendary-arena/game-engine';

// why: boardgame.io v0.50 only ships a CJS server bundle (dist/cjs/server.js)
// with no ESM entrypoint. Node v22+ ESM does not resolve CJS-only subpackage
// directory imports. createRequire bridges this gap without adding a bundler.
const require = createRequire(import.meta.url);
const { Server } = require('boardgame.io/server');

/**
 * Registers the /health endpoint on the boardgame.io koa router.
 * Returns { status: 'ok' } for Render health checks and pnpm check.
 *
 * @param {import('@koa/router')} router - The boardgame.io server's koa router.
 */
function registerHealthRoute(router) {
  router.get('/health', (koaContext) => {
    koaContext.body = { status: 'ok' };
  });
}

/**
 * Loads the card registry from local JSON files in data/metadata/ and
 * data/cards/. Logs a summary on success. On failure, logs a full-sentence
 * error and exits the process.
 *
 * @returns {Promise<import('@legendary-arena/registry').CardRegistry>}
 */
async function loadRegistry() {
  try {
    // why: The server loads card data from local files at startup, not via
    // the HTTP/R2 loader. The HTTP loader is for browser clients that fetch
    // card data from Cloudflare R2. The server has direct filesystem access
    // to data/, so local loading is simpler and avoids a network round-trip.
    const registry = await createRegistryFromLocalFiles({
      metadataDir: 'data/metadata',
      cardsDir: 'data/cards',
    });

    const registryInfo = registry.info();
    console.log(
      `[server] registry loaded: ${registryInfo.totalSets} sets, ` +
      `${registryInfo.totalHeroes} heroes, ${registryInfo.totalCards} cards`
    );

    return registry;
  } catch (error) {
    console.error(
      `[server] Failed to load card registry from local files. ` +
      `Check that data/metadata/sets.json and data/cards/ exist. ` +
      `Error: ${error.message}`
    );
    process.exit(1);
  }
}

// why: `tryConstructHankoVerifier()` implements the D-13101
// startup-policy gate — it is NOT a "best-effort" attempt despite
// the `try` prefix. The `try` prefix names the return type
// (`SessionVerifier | undefined`); the production-vs-non-production
// branching IS the policy. In production, missing or invalid env
// is a fatal misconfiguration (throw → caller `index.mjs` propagates
// → process.exit(1)); in non-production, the helper deliberately
// returns `undefined` to preserve local-dev ergonomics for engineers
// iterating on non-authenticated routes who do not need a Hanko
// tenant. This mirrors the `DATABASE_URL` startup posture in
// `index.mjs:34`.
/**
 * Constructs the Hanko `SessionVerifier` from environment variables
 * if both `HANKO_TENANT_BASE_URL` and `HANKO_EXPECTED_AUDIENCE` are
 * present and non-empty. Branches on `NODE_ENV` per D-13101:
 *
 * - Production + complete env: constructs the verifier, logs the
 *   masked configuration line per D-13104 (origin preserved, path
 *   replaced with `***`), returns the verifier.
 * - Production + incomplete env: throws a full-sentence diagnostic
 *   that the caller (`index.mjs`) surfaces before `process.exit(1)`.
 * - Non-production + complete env: identical to the production
 *   complete-env path (same log line + return).
 * - Non-production + incomplete env: logs the fail-closed-dev-mode
 *   diagnostic and returns `undefined` so authenticated routes
 *   continue to surface `'session_verifier_not_configured'` per
 *   the WP-112 D-11204 default — preserves the pre-WP-131
 *   local-dev ergonomics verbatim.
 *
 * Constructs the verifier exactly once per call. The single
 * construction site mirrors the `pool = createPool()` invariant.
 *
 * @returns {import('./auth/sessionToken.types.js').SessionVerifier | undefined}
 */
export function tryConstructHankoVerifier() {
  const tenantBaseUrl = process.env.HANKO_TENANT_BASE_URL;
  const expectedAudience = process.env.HANKO_EXPECTED_AUDIENCE;
  const refreshIntervalRaw = process.env.HANKO_JWKS_REFRESH_INTERVAL_MS;

  const envComplete =
    typeof tenantBaseUrl === 'string' &&
    tenantBaseUrl.length > 0 &&
    typeof expectedAudience === 'string' &&
    expectedAudience.length > 0;

  if (envComplete) {
    // why: `Number(undefined)` produces `NaN`, which would defeat
    // the D-12603 default substitution inside the verifier factory
    // (the factory checks `jwksRefreshIntervalMs === undefined` to
    // apply the 300_000ms default; `NaN` is a number and bypasses
    // that branch). Pass `undefined` explicitly when the env var
    // is unset.
    const jwksRefreshIntervalMs =
      refreshIntervalRaw === undefined
        ? undefined
        : Number(refreshIntervalRaw);

    try {
      const verifier = createHankoSessionVerifier({
        tenantBaseUrl,
        expectedAudience,
        jwksRefreshIntervalMs,
      });

      // why: D-13104 origin-only masking — the path component is
      // replaced with `***` so accidental log-aggregation exposure
      // (Datadog, Loggly, etc.) does not leak the tenant ID. The
      // origin preserves the "did the env var resolve at all" signal
      // for operator diagnostics.
      let maskedTenantBaseUrl = tenantBaseUrl;
      try {
        const parsed = new URL(tenantBaseUrl);
        maskedTenantBaseUrl = `${parsed.origin}/***`;
      } catch {
        maskedTenantBaseUrl = '***';
      }
      const refreshLogged =
        jwksRefreshIntervalMs === undefined ? 'default' : jwksRefreshIntervalMs;
      console.log(
        `[server] Hanko verifier configured (tenantBaseUrl=${maskedTenantBaseUrl}, refresh=${refreshLogged}ms)`
      );
      return verifier;
    } catch (error) {
      console.error(
        `[server] Failed to construct Hanko verifier. ` +
          `Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard. ` +
          `Error: ${error.message}`
      );
      throw error;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Hanko verifier configuration is incomplete. Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard before deploying. Production cannot start without them.'
    );
  }

  console.log(
    `[server] Hanko verifier NOT configured — running in fail-closed dev mode (set HANKO_TENANT_BASE_URL + HANKO_EXPECTED_AUDIENCE to enable authenticated routes)`
  );
  return undefined;
}

/**
 * Starts the boardgame.io server after loading the card registry and rules
 * from PostgreSQL. Both startup tasks must succeed before the server accepts
 * requests. On failure, logs a full-sentence error and exits.
 *
 * @returns {Promise<{ appServer: import('http').Server, pool: import('pg').Pool }>}
 *   The running HTTP server instance and the long-lived `pg.Pool`. The
 *   caller (`apps/server/src/index.mjs`) closes the pool from the SIGTERM
 *   path after the HTTP server's graceful-shutdown step resolves.
 */
export async function startServer() {
  // why: PAR gate is the third independent startup task per WP-051 / D-5101.
  // Non-blocking: createParGate handles all failure modes internally
  // (warn-log + continue with partial or empty coverage per D-5101 graceful
  // degradation; server never crashes on PAR-load failure). PAR_VERSION env
  // var is read per D-5102; the ?? 'v1' fallback matches the PORT ?? '8000'
  // pattern below.
  const [registry, , parGate] = await Promise.all([
    loadRegistry(),
    loadRules(),
    createParGate('data/par', process.env.PAR_VERSION ?? 'v1'),
  ]);

  // why: D-10014 — engine's setRegistryForSetup() must be called
  // before Server() is constructed so Game.setup() sees the
  // registry on every match-create. WP-100 smoke test on
  // 2026-04-27 surfaced this gap: the server loaded the registry
  // but never wired it, so validateMatchSetup was silently
  // skipped via the `if (gameRegistry)` guard at game.ts:201-210
  // and every match was structurally empty.
  setRegistryForSetup(registry);

  const rules = getRules();
  const rulesCount = Object.keys(rules.rules).length;

  // why: boardgame.io Server() is the authoritative game server. On Render,
  // it handles both HTTP (health checks, lobby API) and WebSocket (real-time
  // game state sync) traffic on a single port. Render's load balancer
  // upgrades WebSocket connections automatically -- no separate WS port needed.
  const server = Server({
    games: [LegendaryGame],
    // why: CORS origins are written as a literal array per code style Rule 7.
    // Only the production SPA and local Vite dev server are allowed.
    origins: [
      'https://cards.barefootbetters.com',
      'http://localhost:5173',
    ],
  });

  registerHealthRoute(server.router);

  // why: WP-115 — construct the long-lived pg.Pool exactly once
  // here. Lifetime is the process lifetime; close-on-SIGTERM is
  // owned by index.mjs (after the HTTP server's graceful-shutdown
  // step resolves), never by a route handler. parGate is now bound
  // (no longer dangling per the pre-existing `void parGate;`
  // placeholder removed in this commit) — registerLeaderboardRoutes
  // injects parGate.checkParPublished into every WP-054 call site.
  // WP-102's registerProfileRoutes is intentionally NOT wired here
  // per D-10202 — that follow-up WP owns its own commit even though
  // the pool introduced here is the lifecycle anchor it needs.
  const pool = createPool();
  console.log('[server] pg.Pool constructed (max=10)');
  const verifier = tryConstructHankoVerifier();
  registerLeaderboardRoutes(server.router, pool, parGate);

  // why: WP-104 / D-10408 — register the three owner-only routes
  // (/api/me/profile GET + PATCH, /api/me/links PUT) on the same
  // long-lived pool. requireAuthenticatedSession is the WP-112
  // orchestrator; the per-request `verifier` + `accountResolver`
  // bindings come from the deps bundle threaded here. WP-131 wires
  // the Hanko verifier (production) or leaves both fields undefined
  // (dev-mode + missing env) — the existing fail-closed orchestrator
  // path handles the dev-mode case unchanged, surfacing 500 with
  // code: 'session_verifier_not_configured' per D-11204.
  registerOwnerProfileRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
  });

  // why: WP-109 / D-10408 — register the eight team-affiliation
  // routes (/api/teams + 7 team-scoped endpoints) on the same
  // long-lived pool. Same caller-injected pattern as
  // registerOwnerProfileRoutes. WP-131 wires the Hanko verifier
  // (production) or leaves both fields undefined (dev-mode +
  // missing env) — the existing fail-closed orchestrator path
  // handles the dev-mode case unchanged, surfacing 500 with
  // code: 'session_verifier_not_configured' per D-11204.
  registerTeamRoutes(server.router, pool, {
    requireAuthenticatedSession,
    verifier,
    accountResolver: verifier === undefined ? undefined : productionAccountResolver,
  });

  // why: Render.com injects PORT automatically. The fallback 8000 is for
  // local development only. Do not set PORT in the Render dashboard --
  // Render will override it anyway and double-setting causes confusion.
  const port = process.env.PORT ?? '8000';

  const { appServer } = await server.run({ port: Number(port) });

  console.log(
    `[server] listening on port ${port} ` +
    `(${rulesCount} rules loaded, NODE_ENV=${process.env.NODE_ENV ?? 'development'})`
  );

  return { appServer, pool };
}
