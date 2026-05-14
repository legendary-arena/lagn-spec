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

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { startServer } from './server.mjs';
import { closePool } from './db/database.js';
import {
  isLegendsPublisherEnabled,
  getLegendsPublisherIntervalMs,
  startLegendsPublisher,
} from './legends/legends.scheduler.js';

/**
 * Initialises the server and registers the shutdown handler.
 */
async function main() {
  let httpServer;
  let pool;
  let legendsPublisherHandle;

  try {
    const started = await startServer();
    httpServer = started.appServer;
    pool = started.pool;

    // why: conditionally start the legends publisher only when
    // LEGENDS_PUBLISHER_ENABLED=true (kill switch per D-14202).
    // If pool is unavailable or undefined, the scheduler MUST NOT
    // start (fail closed). The R2 client is constructed here as
    // the S3Client → LegendsR2Client adapter.
    if (isLegendsPublisherEnabled() && pool !== undefined) {
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
      });

      /** @type {import('./legends/legends.types.js').LegendsR2Client} */
      const r2Client = {
        async putObject(params) {
          const command = new PutObjectCommand({
            Bucket: params.bucket,
            Key: params.key,
            Body: params.body,
            ContentType: params.contentType,
          });
          await s3Client.send(command, { abortSignal: params.signal });
        },
      };

      legendsPublisherHandle = startLegendsPublisher({
        bucket: process.env.R2_LEGENDS_BUCKET ?? '',
        database: pool,
        intervalMs: getLegendsPublisherIntervalMs(),
        leaderboardDeps: started.leaderboardDeps,
        r2Client,
      });
    } else if (isLegendsPublisherEnabled() && pool === undefined) {
      console.warn(
        '[legends-publisher] LEGENDS_PUBLISHER_ENABLED=true but pool is unavailable. Publisher not started.',
      );
    } else {
      console.log(
        '[legends-publisher] Disabled (set LEGENDS_PUBLISHER_ENABLED=true to enable).',
      );
    }
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
    if (legendsPublisherHandle !== undefined) {
      legendsPublisherHandle.stop();
    }
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
