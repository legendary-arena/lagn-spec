/**
 * Legends Snapshot Scheduler — Timer Wrapper (WP-142)
 *
 * `startLegendsPublisher()` wires `setInterval` over
 * `publishAllBoards`, with a single-flight guard (skip overlapping
 * runs), a kill switch via `LEGENDS_PUBLISHER_ENABLED`, and a
 * `stop()` method that clears the interval and prevents further runs.
 *
 * Health state is replaced atomically via `state = { ... }` (never
 * field-by-field mutation) per EC-157 §Locked Values.
 *
 * Layer-boundary contract: no engine, registry, preplan, or UI imports.
 *
 * Authority: WP-142 §C; EC-157 §Locked Values; D-14201, D-14202.
 */

import type { DatabaseClient, LeaderboardDependencies } from '../leaderboards/leaderboard.types.js';
import type {
  LegendsPublisherHealthState,
  LegendsR2Client,
} from './legends.types.js';
import { publishAllBoards } from './legends.publisher.js';

// ---------------------------------------------------------------------------
// Default cadence
// ---------------------------------------------------------------------------

// why: 5-minute cadence per D-14201 — shorter interval means fresher
// scoreboard but more DB load; 5 min is well under the cache-TTL
// threshold for casual viewers and well over the publish-time budget.
const LEGENDS_PUBLISHER_INTERVAL_MS = 300_000;

// ---------------------------------------------------------------------------
// Scheduler state
// ---------------------------------------------------------------------------

let healthState: LegendsPublisherHealthState = {
  intervalMs: LEGENDS_PUBLISHER_INTERVAL_MS,
  lastErrorAt: null,
  lastErrorMessage: null,
  lastSuccessAt: null,
  status: 'idle',
};

/**
 * Returns the current health state for the `/health/legends-publisher`
 * endpoint.
 */
export function getLegendsPublisherHealth(): LegendsPublisherHealthState {
  return healthState;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

/**
 * Starts the background legends publisher on a fixed cadence.
 *
 * Returns a `stop()` function that clears the interval AND prevents
 * further runs (does NOT abort in-flight publishes).
 */
export function startLegendsPublisher(options: {
  readonly bucket: string;
  readonly database: DatabaseClient;
  readonly intervalMs?: number;
  readonly leaderboardDeps: LeaderboardDependencies;
  readonly r2Client: LegendsR2Client;
}): { stop: () => void } {
  const intervalMs = options.intervalMs ?? LEGENDS_PUBLISHER_INTERVAL_MS;
  let isRunning = false;
  let isStopped = false;

  // why: health state replaced atomically via `healthState = { ... }`
  // — never field-by-field mutation per EC-157 §Locked Values.
  healthState = {
    intervalMs,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastSuccessAt: null,
    status: 'idle',
  };

  async function tick(): Promise<void> {
    if (isStopped) {
      return;
    }

    // why: single-flight guard — skip overlapping runs. If the
    // previous publish is still in-flight, log a warning and skip.
    // This prevents DB connection pile-up on slow R2 writes.
    if (isRunning) {
      console.warn(
        '[legends-publisher] Skipping run — previous publish still in flight.',
      );
      return;
    }

    isRunning = true;
    try {
      const result = await publishAllBoards(
        options.database,
        options.r2Client,
        options.bucket,
        options.leaderboardDeps,
      );

      const anyFailed = result.boards.some(
        (board) => !board.success,
      );

      if (anyFailed || !result.manifestWritten) {
        const failedBoards: string[] = [];
        for (const board of result.boards) {
          if (!board.success) {
            failedBoards.push(board.board);
          }
        }
        const errorMessage = `Publish incomplete: ${failedBoards.length} board(s) failed [${failedBoards.join(', ')}]`;
        healthState = {
          intervalMs,
          lastErrorAt: new Date().toISOString(),
          lastErrorMessage: errorMessage,
          lastSuccessAt: healthState.lastSuccessAt,
          status: 'error',
        };
      } else {
        healthState = {
          intervalMs,
          lastErrorAt: healthState.lastErrorAt,
          lastErrorMessage: healthState.lastErrorMessage,
          lastSuccessAt: new Date().toISOString(),
          status: 'ok',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      healthState = {
        intervalMs,
        lastErrorAt: new Date().toISOString(),
        lastErrorMessage: errorMessage,
        lastSuccessAt: healthState.lastSuccessAt,
        status: 'error',
      };
      console.error(
        `[legends-publisher] Unhandled error during publish run: ${errorMessage}`,
      );
    } finally {
      isRunning = false;
    }
  }

  const intervalHandle = setInterval(() => {
    // why: fire-and-forget — the tick() promise is not awaited by
    // setInterval. Errors are caught inside tick() and reflected in
    // health state, never thrown to the timer.
    void tick();
  }, intervalMs);

  // why: run immediately on startup so the first snapshot is
  // available without waiting for the first interval tick.
  void tick();

  console.log(
    `[legends-publisher] Started with ${intervalMs}ms cadence.`,
  );

  return {
    stop(): void {
      // why: stop() clears the interval AND prevents further runs
      // (does NOT abort in-flight). Setting isStopped before
      // clearInterval ensures a tick() that's mid-flight finishes
      // but no new tick() fires.
      isStopped = true;
      clearInterval(intervalHandle);
      console.log('[legends-publisher] Stopped.');
    },
  };
}

// ---------------------------------------------------------------------------
// Env check
// ---------------------------------------------------------------------------

/**
 * Returns true if the legends publisher is enabled via environment
 * variable. Default is off (fail-closed).
 */
// why: kill switch per D-14202 — default off so test/dev runs don't
// write to prod R2. Only `LEGENDS_PUBLISHER_ENABLED=true` (exact
// string match) enables the publisher.
export function isLegendsPublisherEnabled(): boolean {
  return process.env.LEGENDS_PUBLISHER_ENABLED === 'true';
}

/**
 * Reads the interval override from environment, or returns the default.
 */
export function getLegendsPublisherIntervalMs(): number {
  const raw = process.env.LEGENDS_PUBLISHER_INTERVAL_MS;
  if (raw === undefined) {
    return LEGENDS_PUBLISHER_INTERVAL_MS;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed < 10_000) {
    return LEGENDS_PUBLISHER_INTERVAL_MS;
  }
  return parsed;
}
