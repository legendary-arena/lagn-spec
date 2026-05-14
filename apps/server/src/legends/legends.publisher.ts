/**
 * Legends Snapshot Publisher — I/O Layer (WP-142)
 *
 * `publishAllBoards()` runs all leaderboard queries inside a single
 * `BEGIN; SET TRANSACTION READ ONLY; ... COMMIT;` scope, builds
 * snapshot boards, writes each board to R2, then writes the manifest
 * LAST. R2 errors are caught and returned in `PublishResult` — never
 * thrown. Archive writes once per UTC day.
 *
 * Layer-boundary contract: no engine, registry, preplan, or UI imports.
 *
 * Authority: WP-142 §B; EC-157 §Locked Values; D-14201..D-14204.
 */

import { randomBytes } from 'node:crypto';

import type { DatabaseClient } from '../leaderboards/leaderboard.types.js';
import type {
  BoardPublishOutcome,
  LegendsManifest,
  LegendsR2Client,
  PublishResult,
} from './legends.types.js';

import {
  buildBoardList,
  buildGlobalTopSnapshot,
  buildScenarioSnapshot,
  serializeSnapshot,
} from './legends.logic.js';

import {
  getGlobalTopLeaderboard,
  getScenarioLeaderboard,
  listScenarioKeys,
} from '../leaderboards/leaderboard.logic.js';

import type { LeaderboardDependencies } from '../leaderboards/leaderboard.types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUCKET_PREFIX = 'legends/v1/';
const MANIFEST_KEY = 'legends/v1/manifest.json';
const GLOBAL_TOP_QUERY_LIMIT = 500;
const SCENARIO_QUERY_LIMIT = 100;

// ---------------------------------------------------------------------------
// Archive tracking (module-level, reset on process restart)
// ---------------------------------------------------------------------------

let lastArchivedDate: string | null = null;

/**
 * Resets the archive tracking state. Exposed only for tests.
 */
export function resetArchiveTracking(): void {
  lastArchivedDate = null;
}

// ---------------------------------------------------------------------------
// Internal: board payload collected during a publish run
// ---------------------------------------------------------------------------

interface BoardPayload {
  readonly boardName: string;
  readonly jsonPayload: string;
  readonly rowCount: number;
}

// ---------------------------------------------------------------------------
// Publisher
// ---------------------------------------------------------------------------

/**
 * Publishes all leaderboard snapshot boards to R2. Queries run inside
 * a single READ ONLY transaction to get a consistent view of the data.
 *
 * Boards are written in sorted-ASC order, then the manifest LAST.
 * If any board write fails, the manifest is NOT updated — consumers
 * reading a stale manifest see a consistent prior snapshot.
 *
 * R2 errors are caught and returned in `PublishResult` — never thrown.
 */
export async function publishAllBoards(
  database: DatabaseClient,
  r2Client: LegendsR2Client,
  bucket: string,
  leaderboardDeps: LeaderboardDependencies,
): Promise<PublishResult> {
  // why: runId format is <ISO-timestamp>-<4-char-hex> per EC-157
  // §Locked Values. crypto.randomBytes(2) yields 4 hex chars.
  const runId = `${new Date().toISOString()}-${randomBytes(2).toString('hex')}`;

  const boardOutcomes: BoardPublishOutcome[] = [];
  const boardPayloads: BoardPayload[] = [];
  let anyBoardFailed = false;

  // why: READ ONLY transaction ensures the publisher does not contend
  // with hot match traffic per WP-142 §Non-Negotiable Constraints.
  // All leaderboard queries run inside this scope for a consistent
  // point-in-time snapshot.
  await database.query('BEGIN');
  await database.query('SET TRANSACTION READ ONLY');

  let scenarioKeys: string[];
  try {
    scenarioKeys = await listScenarioKeys(database);
  } catch (error) {
    await database.query('ROLLBACK');
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        runId,
        board: '*',
        rowCount: 0,
        byteCount: 0,
        putLatencyMs: 0,
        success: false,
        error: `Failed to list scenario keys: ${errorMessage}`,
      }),
    );
    return { boards: [], manifestWritten: false, runId };
  }

  const boardNames = buildBoardList(scenarioKeys);

  // --- Build and write global-top snapshot ---
  try {
    const globalLeaderboard = await getGlobalTopLeaderboard(
      { limit: GLOBAL_TOP_QUERY_LIMIT, offset: 0 },
      database,
      leaderboardDeps,
    );
    const globalSnapshot = buildGlobalTopSnapshot(globalLeaderboard);
    const globalJson = serializeSnapshot(globalSnapshot);

    boardPayloads.push({
      boardName: 'global-top',
      jsonPayload: globalJson,
      rowCount: globalSnapshot.rowCount,
    });

    const outcome = await writeBoardToR2(
      r2Client, bucket, 'global-top', globalJson, globalSnapshot.rowCount, runId,
    );
    boardOutcomes.push(outcome);
    if (!outcome.success) {
      anyBoardFailed = true;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    anyBoardFailed = true;
    boardOutcomes.push({
      board: 'global-top',
      byteCount: 0,
      errorMessage,
      putLatencyMs: 0,
      rowCount: 0,
      success: false,
    });
    logBoardOutcome(runId, 'global-top', 0, 0, 0, false, errorMessage);
  }

  // --- Build and write per-scenario snapshots (sorted ASC) ---
  const sortedScenarioKeys = [...scenarioKeys].sort();
  for (const scenarioKey of sortedScenarioKeys) {
    const boardName = `scenario-${scenarioKey.toLowerCase()}`;
    try {
      const scenarioLeaderboard = await getScenarioLeaderboard(
        { scenarioKey, limit: SCENARIO_QUERY_LIMIT, offset: 0 },
        database,
        leaderboardDeps,
      );
      const scenarioSnapshot = buildScenarioSnapshot(scenarioLeaderboard);
      const scenarioJson = serializeSnapshot(scenarioSnapshot);

      boardPayloads.push({
        boardName: scenarioSnapshot.board,
        jsonPayload: scenarioJson,
        rowCount: scenarioSnapshot.rowCount,
      });

      const outcome = await writeBoardToR2(
        r2Client, bucket, scenarioSnapshot.board, scenarioJson,
        scenarioSnapshot.rowCount, runId,
      );
      boardOutcomes.push(outcome);
      if (!outcome.success) {
        anyBoardFailed = true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      anyBoardFailed = true;
      boardOutcomes.push({
        board: boardName,
        byteCount: 0,
        errorMessage,
        putLatencyMs: 0,
        rowCount: 0,
        success: false,
      });
      logBoardOutcome(runId, boardName, 0, 0, 0, false, errorMessage);
    }
  }

  await database.query('COMMIT');

  // --- Write archive (once per UTC day) ---
  const currentDateUtc = new Date().toISOString().slice(0, 10);
  if (currentDateUtc !== lastArchivedDate && !anyBoardFailed) {
    try {
      for (const payload of boardPayloads) {
        const archiveKey = `${BUCKET_PREFIX}archive/${currentDateUtc}/${payload.boardName}.json`;
        await r2Client.putObject({
          body: payload.jsonPayload,
          bucket,
          contentType: 'application/json',
          key: archiveKey,
          signal: AbortSignal.timeout(10_000),
        });
      }
      lastArchivedDate = currentDateUtc;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          runId,
          board: 'archive',
          error: `Archive write failed: ${errorMessage}`,
        }),
      );
    }
  }

  // why: manifest is written LAST per D-14204. If any board failed,
  // the manifest is NOT updated — consumers see the prior consistent
  // snapshot.
  let manifestWritten = false;
  if (!anyBoardFailed) {
    try {
      const generatedAt = new Date().toISOString();
      const manifest: LegendsManifest = {
        boards: boardNames,
        generatedAt,
        schemaVersion: 1,
      };
      const manifestJson = JSON.stringify(manifest);

      await r2Client.putObject({
        body: manifestJson,
        bucket,
        contentType: 'application/json',
        key: MANIFEST_KEY,
        signal: AbortSignal.timeout(10_000),
      });
      manifestWritten = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          runId,
          board: 'manifest',
          error: `Manifest write failed: ${errorMessage}`,
        }),
      );
    }
  }

  return { boards: boardOutcomes, manifestWritten, runId };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Writes a single board JSON to R2 with a 10-second per-PUT timeout.
 */
async function writeBoardToR2(
  r2Client: LegendsR2Client,
  bucket: string,
  boardName: string,
  jsonPayload: string,
  rowCount: number,
  runId: string,
): Promise<BoardPublishOutcome> {
  const key = `${BUCKET_PREFIX}${boardName}.json`;
  const byteCount = Buffer.byteLength(jsonPayload, 'utf8');
  const startTime = performance.now();

  try {
    // why: AbortSignal.timeout(10_000) per PUT, not globally, per
    // EC-157 §Locked Values. A slow PUT on one board does not
    // cancel other board writes.
    await r2Client.putObject({
      body: jsonPayload,
      bucket,
      contentType: 'application/json',
      key,
      signal: AbortSignal.timeout(10_000),
    });

    const putLatencyMs = Math.round(performance.now() - startTime);
    logBoardOutcome(runId, boardName, rowCount, byteCount, putLatencyMs, true);

    return {
      board: boardName,
      byteCount,
      putLatencyMs,
      rowCount,
      success: true,
    };
  } catch (error) {
    const putLatencyMs = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : String(error);
    logBoardOutcome(runId, boardName, rowCount, byteCount, putLatencyMs, false, errorMessage);

    return {
      board: boardName,
      byteCount,
      errorMessage,
      putLatencyMs,
      rowCount,
      success: false,
    };
  }
}

/**
 * Emits a structured JSON log line per board per EC-157 §Locked Values.
 */
function logBoardOutcome(
  runId: string,
  board: string,
  rowCount: number,
  byteCount: number,
  putLatencyMs: number,
  success: boolean,
  errorMessage?: string,
): void {
  const logEntry: Record<string, unknown> = {
    runId,
    board,
    rowCount,
    byteCount,
    putLatencyMs,
    success,
  };
  if (errorMessage !== undefined) {
    logEntry.error = errorMessage;
  }
  console.log(JSON.stringify(logEntry));
}
