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
  registerLeaderboardRoutes(server.router, pool, parGate);

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
