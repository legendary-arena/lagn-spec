/**
 * Legendary Arena -- Process Entrypoint
 *
 * Starts the game server and handles graceful shutdown on SIGTERM.
 * This is the file referenced in render.yaml startCommand.
 */

// why: index.mjs is the process entrypoint -- it owns process lifecycle
// (startup, shutdown, error handling). server.mjs is the configuration
// module -- it assembles the boardgame.io Server() with the correct game,
// registry, and middleware. Separating the two keeps server.mjs testable
// without triggering process-level side effects.

import { startServer } from './server.mjs';
import { closePool } from './db/database.js';

/**
 * Initialises the server and registers the shutdown handler.
 */
async function main() {
  let httpServer;
  let pool;

  try {
    const started = await startServer();
    httpServer = started.appServer;
    pool = started.pool;
  } catch (error) {
    // why: startServer() may throw non-Error values (e.g. from boardgame.io
    // or pg internals). Coercing to String avoids logging "undefined".
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[server] Failed to start the Legendary Arena server. ` +
      `Error: ${errorMessage}. ` +
      `Check that DATABASE_URL is set and PostgreSQL is reachable.`
    );
    process.exit(1);
  }

  // why: Render.com sends SIGTERM when deploying a new version or scaling down.
  // Graceful shutdown lets in-flight WebSocket frames complete and database
  // connections close cleanly, preventing client-side errors during deploys.
  // why: WP-115 — closePool(pool) MUST run AFTER httpServer.close()'s
  // callback resolves. Closing the pool before HTTP shutdown completes
  // would sever in-flight handlers mid-query (any leaderboard request
  // already past the Cache-Control set() but not yet returned would
  // surface a `pg` "Cannot use a pool after calling end" error to the
  // client, defeating the graceful-shutdown contract).
  process.on('SIGTERM', () => {
    console.log('[server] SIGTERM received -- shutting down gracefully.');
    httpServer.close(async () => {
      console.log('[server] HTTP server closed. Closing pg.Pool.');
      try {
        await closePool(pool);
        console.log('[server] pg.Pool closed. Exiting.');
      } catch (error) {
        // why: pool.end() may reject if a checked-out client never
        // returned; log the failure and exit anyway since the HTTP
        // server has already closed and holding the process open
        // serves no recovery purpose.
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[server] pg.Pool close failed during SIGTERM. ` +
          `Error: ${errorMessage}. Exiting anyway.`
        );
      }
      process.exit(0);
    });
  });
}

main();
