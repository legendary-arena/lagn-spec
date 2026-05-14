/**
 * Tests for the legends snapshot publisher (WP-142).
 *
 * Uses a stub R2 client; verifies error paths do not throw, manifest
 * is not written on board failure, and publisher-layer byte-identity.
 * No real R2 SDK imported.
 *
 * Authority: WP-142 §G; EC-157 §Test Plan.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { publishAllBoards, resetArchiveTracking } from './legends.publisher.js';
import type { LegendsR2Client } from './legends.types.js';
import type {
  DatabaseClient,
  LeaderboardDependencies,
} from '../leaderboards/leaderboard.types.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

interface PutCall {
  readonly body: string;
  readonly bucket: string;
  readonly key: string;
}

function createStubR2Client(options?: {
  failOnKey?: string;
}): { client: LegendsR2Client; putCalls: PutCall[] } {
  const putCalls: PutCall[] = [];
  const client: LegendsR2Client = {
    async putObject(params) {
      if (options?.failOnKey !== undefined && params.key.includes(options.failOnKey)) {
        throw new Error(`Simulated R2 failure on key: ${params.key}`);
      }
      putCalls.push({
        body: params.body,
        bucket: params.bucket,
        key: params.key,
      });
    },
  };
  return { client, putCalls };
}

/**
 * Stub database that returns canned results for the leaderboard queries.
 */
function createStubDatabase(options?: {
  scenarioKeys?: string[];
  failOnQuery?: string;
}): DatabaseClient {
  const scenarioKeys = options?.scenarioKeys ?? ['test-scenario'];

  return {
    async query(text: string, params?: unknown[]) {
      if (options?.failOnQuery !== undefined && text.includes(options.failOnQuery)) {
        throw new Error(`Simulated DB failure on: ${options.failOnQuery}`);
      }

      // BEGIN / SET TRANSACTION READ ONLY / COMMIT / ROLLBACK
      if (
        text === 'BEGIN' ||
        text === 'SET TRANSACTION READ ONLY' ||
        text === 'COMMIT' ||
        text === 'ROLLBACK'
      ) {
        return { rows: [], rowCount: 0 };
      }

      // listScenarioKeys
      if (text.includes('DISTINCT cs.scenario_key')) {
        const rows = scenarioKeys.map((scenarioKey) => ({ scenario_key: scenarioKey }));
        return { rows, rowCount: rows.length };
      }

      // COUNT(*)
      if (text.includes('COUNT(*)')) {
        return { rows: [{ total: '2' }], rowCount: 1 };
      }

      // getScenarioLeaderboard / getGlobalTopLeaderboard
      if (text.includes('FROM legendary.competitive_scores')) {
        const rows = [
          {
            replay_hash: 'hash-1',
            player_display_name: 'Alice',
            scenario_key: (params && params[0] !== undefined)
              ? (Array.isArray(params[0]) ? params[0][0] : params[0])
              : 'test-scenario',
            final_score: 42,
            raw_score: 40,
            par_version: 'v1',
            scoring_config_version: 1,
            created_at: '2026-01-01T00:00:00.000Z',
          },
          {
            replay_hash: 'hash-2',
            player_display_name: 'Bob',
            scenario_key: (params && params[0] !== undefined)
              ? (Array.isArray(params[0]) ? params[0][0] : params[0])
              : 'test-scenario',
            final_score: 50,
            raw_score: 48,
            par_version: 'v1',
            scoring_config_version: 1,
            created_at: '2026-01-02T00:00:00.000Z',
          },
        ];
        return { rows, rowCount: rows.length };
      }

      return { rows: [], rowCount: 0 };
    },
  } as DatabaseClient;
}

function createStubDeps(): LeaderboardDependencies {
  return {
    checkParPublished: () => ({
      parValue: 45,
      parVersion: 'v1',
      source: 'simulation' as const,
      scoringConfig: { baseMultiplier: 1 } as never,
    }),
    getScenarioKeysForTheme: () => null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('legends publisher (WP-142)', () => {
  beforeEach(() => {
    resetArchiveTracking();
  });

  test('publishAllBoards writes boards and manifest to R2 on success', async () => {
    const database = createStubDatabase({ scenarioKeys: ['alpha-scenario'] });
    const { client, putCalls } = createStubR2Client();
    const deps = createStubDeps();

    const result = await publishAllBoards(database, client, 'test-bucket', deps);

    assert.equal(result.manifestWritten, true);
    assert.equal(result.boards.length, 2);

    for (const board of result.boards) {
      assert.equal(board.success, true);
    }

    const putKeys = putCalls.map((call) => call.key);
    assert.ok(putKeys.some((key) => key.includes('global-top.json')));
    assert.ok(putKeys.some((key) => key.includes('scenario-alpha-scenario.json')));
    assert.ok(putKeys.some((key) => key.includes('manifest.json')));
  });

  test('manifest is NOT written when a board PUT fails', async () => {
    const database = createStubDatabase({ scenarioKeys: ['fail-scenario'] });
    const { client, putCalls } = createStubR2Client({
      failOnKey: 'global-top',
    });
    const deps = createStubDeps();

    const result = await publishAllBoards(database, client, 'test-bucket', deps);

    assert.equal(result.manifestWritten, false);

    const hasManifest = putCalls.some((call) => call.key.includes('manifest.json'));
    assert.equal(hasManifest, false, 'Manifest must not be written when a board fails.');
  });

  test('R2 errors are returned in PublishResult — never thrown', async () => {
    const database = createStubDatabase({ scenarioKeys: ['err-scenario'] });
    const { client } = createStubR2Client({ failOnKey: 'scenario-err-scenario' });
    const deps = createStubDeps();

    const result = await publishAllBoards(database, client, 'test-bucket', deps);

    assert.ok(result.runId.length > 0);
    assert.equal(typeof result.manifestWritten, 'boolean');

    const failedBoard = result.boards.find(
      (board) => board.board === 'scenario-err-scenario',
    );
    assert.ok(failedBoard !== undefined);
    assert.equal(failedBoard.success, false);
    assert.ok(
      failedBoard.errorMessage !== undefined && failedBoard.errorMessage.length > 0,
    );
  });

  test('two consecutive publishes with same DB state produce byte-identical board files', async () => {
    const database = createStubDatabase({ scenarioKeys: ['stable-scenario'] });
    const deps = createStubDeps();

    const { client: client1, putCalls: puts1 } = createStubR2Client();
    await publishAllBoards(database, client1, 'test-bucket', deps);

    resetArchiveTracking();

    const { client: client2, putCalls: puts2 } = createStubR2Client();
    await publishAllBoards(database, client2, 'test-bucket', deps);

    const boardPuts1 = puts1.filter(
      (put) => !put.key.includes('manifest') && !put.key.includes('archive'),
    );
    const boardPuts2 = puts2.filter(
      (put) => !put.key.includes('manifest') && !put.key.includes('archive'),
    );

    assert.equal(boardPuts1.length, boardPuts2.length);

    for (let index = 0; index < boardPuts1.length; index = index + 1) {
      assert.equal(boardPuts1[index].key, boardPuts2[index].key);
      assert.equal(
        boardPuts1[index].body,
        boardPuts2[index].body,
        `Board file at ${boardPuts1[index].key} must be byte-identical across runs.`,
      );
    }
  });

  test('publishAllBoards handles DB query failure gracefully', async () => {
    const database = createStubDatabase({ failOnQuery: 'DISTINCT' });
    const { client } = createStubR2Client();
    const deps = createStubDeps();

    const result = await publishAllBoards(database, client, 'test-bucket', deps);

    assert.equal(result.boards.length, 0);
    assert.equal(result.manifestWritten, false);
  });

  test('runId format matches <ISO-timestamp>-<4-char-hex>', () => {
    const runIdPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-[0-9a-f]{4}$/;

    const database = createStubDatabase();
    const { client } = createStubR2Client();
    const deps = createStubDeps();

    return publishAllBoards(database, client, 'test-bucket', deps).then(
      (result) => {
        assert.ok(
          runIdPattern.test(result.runId),
          `runId "${result.runId}" must match <ISO-timestamp>-<4-char-hex> format.`,
        );
      },
    );
  });

  test('all R2 puts target the correct bucket', async () => {
    const database = createStubDatabase({ scenarioKeys: ['bucket-test'] });
    const { client, putCalls } = createStubR2Client();
    const deps = createStubDeps();

    await publishAllBoards(database, client, 'my-legends-bucket', deps);

    for (const put of putCalls) {
      assert.equal(put.bucket, 'my-legends-bucket');
    }
  });
});
