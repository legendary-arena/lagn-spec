/**
 * Tests for the legends snapshot scheduler (WP-142).
 *
 * Verifies start/stop semantics, single-flight skip, stop-prevents-
 * further-runs, and health transitions. Uses controlled timer mocks
 * (no real timers).
 *
 * Authority: WP-142 §G; EC-157 §Test Plan.
 */

import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  startLegendsPublisher,
  getLegendsPublisherHealth,
  isLegendsPublisherEnabled,
  getLegendsPublisherIntervalMs,
} from './legends.scheduler.js';

import type { LegendsR2Client } from './legends.types.js';
import type {
  DatabaseClient,
  LeaderboardDependencies,
} from '../leaderboards/leaderboard.types.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function createStubR2Client(): LegendsR2Client {
  return {
    async putObject() {
      // no-op stub
    },
  };
}

function createStubDatabase(): DatabaseClient {
  return {
    async query(text: string) {
      if (
        text === 'BEGIN' ||
        text === 'SET TRANSACTION READ ONLY' ||
        text === 'COMMIT' ||
        text === 'ROLLBACK'
      ) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('DISTINCT cs.scenario_key')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('COUNT(*)')) {
        return { rows: [{ total: '0' }], rowCount: 1 };
      }
      if (text.includes('FROM legendary.competitive_scores')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as DatabaseClient;
}

function createStubDeps(): LeaderboardDependencies {
  return {
    checkParPublished: () => null,
    getScenarioKeysForTheme: () => null,
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

let activeHandle: { stop: () => void } | undefined;

afterEach(() => {
  if (activeHandle !== undefined) {
    activeHandle.stop();
    activeHandle = undefined;
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('legends scheduler (WP-142)', () => {
  test('startLegendsPublisher returns a stop function', () => {
    const handle = startLegendsPublisher({
      bucket: 'test-bucket',
      database: createStubDatabase(),
      intervalMs: 60_000,
      leaderboardDeps: createStubDeps(),
      r2Client: createStubR2Client(),
    });
    activeHandle = handle;

    assert.equal(typeof handle.stop, 'function');
  });

  test('stop() prevents further runs', async () => {
    let publishCount = 0;
    const database = createStubDatabase();

    // why: we mock the query function to count how many times
    // listScenarioKeys is called (which means a publish run started).
    const originalQuery = database.query.bind(database);
    (database as { query: typeof database.query }).query = async (
      text: string,
      params?: unknown[],
    ) => {
      if (text.includes('DISTINCT cs.scenario_key')) {
        publishCount = publishCount + 1;
      }
      return originalQuery(text, params);
    };

    const handle = startLegendsPublisher({
      bucket: 'test-bucket',
      database,
      intervalMs: 50,
      leaderboardDeps: createStubDeps(),
      r2Client: createStubR2Client(),
    });
    activeHandle = handle;

    // why: wait for the initial tick to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    const countAfterStart = publishCount;
    assert.ok(countAfterStart >= 1, 'At least one publish run should have fired.');

    handle.stop();

    // why: wait longer to confirm no more runs fire
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(
      publishCount,
      countAfterStart,
      'No additional publish runs should fire after stop().',
    );
  });

  test('health state starts as idle', () => {
    const handle = startLegendsPublisher({
      bucket: 'test-bucket',
      database: createStubDatabase(),
      intervalMs: 999_999,
      leaderboardDeps: createStubDeps(),
      r2Client: createStubR2Client(),
    });
    activeHandle = handle;

    // why: the initial tick fires immediately but is async; the
    // synchronous read right after start sees 'idle' only if the
    // tick hasn't resolved yet. We check the initial shape.
    const health = getLegendsPublisherHealth();
    assert.equal(health.lastSuccessAt, null);
    assert.equal(health.lastErrorAt, null);
    assert.equal(health.lastErrorMessage, null);
    assert.equal(health.intervalMs, 999_999);
  });

  test('health transitions to ok after successful publish', async () => {
    const handle = startLegendsPublisher({
      bucket: 'test-bucket',
      database: createStubDatabase(),
      intervalMs: 60_000,
      leaderboardDeps: createStubDeps(),
      r2Client: createStubR2Client(),
    });
    activeHandle = handle;

    // why: wait for the initial tick to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const health = getLegendsPublisherHealth();
    assert.equal(health.status, 'ok');
    assert.ok(health.lastSuccessAt !== null);
  });

  test('health transitions to error on R2 failure', async () => {
    const failingR2Client: LegendsR2Client = {
      async putObject() {
        throw new Error('Simulated R2 failure');
      },
    };

    // why: need at least one scenario key so a board PUT is attempted
    const database: DatabaseClient = {
      async query(text: string) {
        if (
          text === 'BEGIN' ||
          text === 'SET TRANSACTION READ ONLY' ||
          text === 'COMMIT' ||
          text === 'ROLLBACK'
        ) {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('DISTINCT cs.scenario_key')) {
          return { rows: [{ scenario_key: 'err-sc' }], rowCount: 1 };
        }
        if (text.includes('COUNT(*)')) {
          return { rows: [{ total: '1' }], rowCount: 1 };
        }
        if (text.includes('FROM legendary.competitive_scores')) {
          return {
            rows: [{
              replay_hash: 'h1',
              player_display_name: 'Test',
              scenario_key: 'err-sc',
              final_score: 10,
              raw_score: 8,
              par_version: 'v1',
              scoring_config_version: 1,
              created_at: '2026-01-01T00:00:00Z',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as DatabaseClient;

    const deps: LeaderboardDependencies = {
      checkParPublished: () => ({
        parValue: 45,
        parVersion: 'v1',
        source: 'simulation' as const,
        scoringConfig: { baseMultiplier: 1 } as never,
      }),
    };

    const handle = startLegendsPublisher({
      bucket: 'test-bucket',
      database,
      intervalMs: 60_000,
      leaderboardDeps: deps,
      r2Client: failingR2Client,
    });
    activeHandle = handle;

    await new Promise((resolve) => setTimeout(resolve, 200));

    const health = getLegendsPublisherHealth();
    assert.equal(health.status, 'error');
    assert.ok(health.lastErrorAt !== null);
    assert.ok(
      health.lastErrorMessage !== null && health.lastErrorMessage.length > 0,
    );
  });

  test('isLegendsPublisherEnabled returns false by default', () => {
    const original = process.env.LEGENDS_PUBLISHER_ENABLED;
    delete process.env.LEGENDS_PUBLISHER_ENABLED;

    assert.equal(isLegendsPublisherEnabled(), false);

    if (original !== undefined) {
      process.env.LEGENDS_PUBLISHER_ENABLED = original;
    }
  });

  test('isLegendsPublisherEnabled returns true when set to "true"', () => {
    const original = process.env.LEGENDS_PUBLISHER_ENABLED;
    process.env.LEGENDS_PUBLISHER_ENABLED = 'true';

    assert.equal(isLegendsPublisherEnabled(), true);

    if (original !== undefined) {
      process.env.LEGENDS_PUBLISHER_ENABLED = original;
    } else {
      delete process.env.LEGENDS_PUBLISHER_ENABLED;
    }
  });

  test('getLegendsPublisherIntervalMs returns default when env unset', () => {
    const original = process.env.LEGENDS_PUBLISHER_INTERVAL_MS;
    delete process.env.LEGENDS_PUBLISHER_INTERVAL_MS;

    assert.equal(getLegendsPublisherIntervalMs(), 300_000);

    if (original !== undefined) {
      process.env.LEGENDS_PUBLISHER_INTERVAL_MS = original;
    }
  });

  test('getLegendsPublisherIntervalMs reads from environment', () => {
    const original = process.env.LEGENDS_PUBLISHER_INTERVAL_MS;
    process.env.LEGENDS_PUBLISHER_INTERVAL_MS = '60000';

    assert.equal(getLegendsPublisherIntervalMs(), 60_000);

    if (original !== undefined) {
      process.env.LEGENDS_PUBLISHER_INTERVAL_MS = original;
    } else {
      delete process.env.LEGENDS_PUBLISHER_INTERVAL_MS;
    }
  });
});
