/**
 * Tests for analytics logic (WP-205 / EC-233 — Sub-task B).
 *
 * Twelve test cases inside three describe blocks (≥8 per EC-233
 * §After Completing → Sub-task B close). Tests use:
 *
 *   - A recording fake `DatabaseClient` that satisfies the
 *     `pool.query()` and `pool.connect()` shapes, returning canned
 *     rows from a per-test queue. The fake records each SQL string
 *     + values pair so tests can assert (a) the locked SQL patterns
 *     are present (window function for channel attribution; column
 *     list in INSERTs; UTC-bucket grouping; signup-complete
 *     exclusion in retention dayN windows) and (b) the result
 *     mapping correctly produces the locked envelope shapes.
 *
 *   - Grep-gate assertions on the source file's literal SQL strings
 *     for the invariants that hold REGARDLESS of which DB rows are
 *     returned (window function presence; INSERT column-list
 *     enumeration; no raw `user_id` bound in INSERT paths).
 *
 * Integration-style tests against a real Postgres (`requires test
 * database`) are NOT included in this file — the SQL is verified
 * via the grep-gate pattern, mirroring the team-logic precedent
 * elsewhere in the server package.
 *
 * Authority: WP-205 §Acceptance Criteria → Aggregation Semantics +
 * Request Validation; EC-233 §After Completing → Sub-task B close;
 * D-20501 (aggregation rules + INSERT discipline + SQL pre-sorted
 * + channel attribution + retention v1 coarse); D-20502 (PII
 * posture — raw `user_id` never bound in INSERT paths).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  type AnalyticsEventRow,
  type DatabaseClient,
  getActivationFunnel,
  getRetentionCohorts,
  getTrafficSources,
  insertAnalyticsEvent,
  insertAnalyticsEventBatch,
} from './analytics.logic.js';

const THIS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const LOGIC_SOURCE_PATH = resolve(THIS_DIRECTORY, 'analytics.logic.ts');

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface FakeDatabaseClient {
  readonly recorded: RecordedQuery[];
  readonly database: DatabaseClient;
  readonly connectCalls: { count: number };
  readonly releaseCalls: { count: number };
}

/**
 * Builds a recording fake DatabaseClient. `cannedRows` is consumed
 * in order — each `pool.query(...)` call returns the next entry's
 * rows. SQL/value pairs are appended to `recorded` so tests can
 * assert the SQL patterns that fired. `connectAndQueryRows` are
 * served by the client returned from `pool.connect()`; the
 * sequence is replayed verbatim through that client.
 *
 * If `throwOnQueryIndex` is supplied, the SQL call at that index
 * (counting connect-client + pool calls together via `recorded`)
 * throws the supplied error to exercise the batch-INSERT rollback
 * branch.
 */
function makeFakeDatabaseClient(options: {
  readonly cannedRows?: ReadonlyArray<{ rows: ReadonlyArray<Record<string, unknown>> }>;
  readonly throwOnQuery?: (sql: string) => Error | null;
}): FakeDatabaseClient {
  const recorded: RecordedQuery[] = [];
  const connectCalls = { count: 0 };
  const releaseCalls = { count: 0 };
  let cannedIndex = 0;
  const cannedRows = options.cannedRows ?? [];
  const throwOnQuery = options.throwOnQuery ?? (() => null);
  const handleQuery = async (sql: string, values?: readonly unknown[]): Promise<{ rows: ReadonlyArray<Record<string, unknown>> }> => {
    recorded.push({ sql, values: values ?? [] });
    const errorToThrow = throwOnQuery(sql);
    if (errorToThrow !== null) {
      throw errorToThrow;
    }
    const next = cannedRows[cannedIndex] ?? { rows: [] };
    cannedIndex = cannedIndex + 1;
    return next;
  };
  const connectedClient = {
    query: handleQuery,
    release: () => {
      releaseCalls.count = releaseCalls.count + 1;
    },
  };
  const database = {
    query: handleQuery,
    connect: async () => {
      connectCalls.count = connectCalls.count + 1;
      return connectedClient;
    },
  } as unknown as DatabaseClient;
  return { recorded, database, connectCalls, releaseCalls };
}

function makeRow(overrides: Partial<AnalyticsEventRow> = {}): AnalyticsEventRow {
  return {
    eventType: 'direct',
    userIdHash: null,
    sessionId: 'session-1',
    timestamp: 1_717_459_200_000,
    properties: {},
    ...overrides,
  };
}

describe('insertAnalyticsEvent / insertAnalyticsEventBatch (WP-205 / D-20501)', () => {
  test('insertAnalyticsEvent issues a single INSERT enumerating target columns explicitly', async () => {
    const fake = makeFakeDatabaseClient({});
    await insertAnalyticsEvent(fake.database, makeRow({ eventType: 'direct' }));
    assert.equal(fake.recorded.length, 1);
    const insertQuery = fake.recorded[0]!;
    // why: D-20501 INSERT column list MANDATORY — the SQL string MUST
    // enumerate target columns explicitly. The positional-bind form
    // `INSERT INTO analytics_events VALUES (...)` is FORBIDDEN.
    assert.match(
      insertQuery.sql,
      /INSERT INTO legendary\.analytics_events\s*\(\s*event_type,\s*user_id_hash,\s*session_id,\s*ts,\s*properties\s*\)/,
      'INSERT statement MUST enumerate target columns (event_type, user_id_hash, session_id, ts, properties) per D-20501 INSERT discipline.',
    );
  });

  test('insertAnalyticsEvent throws when event_type is outside the closed set (logic-layer defense-in-depth per D-20501)', async () => {
    const fake = makeFakeDatabaseClient({});
    await assert.rejects(
      insertAnalyticsEvent(fake.database, makeRow({ eventType: 'unknown' })),
      /out-of-set event_type/,
    );
    assert.equal(
      fake.recorded.length,
      0,
      'No SQL should fire when the logic-layer guard rejects the row; the DB CHECK is the ultimate backstop but the guard surfaces a clearer error site.',
    );
  });

  test('insertAnalyticsEventBatch is a no-op for empty input (no BEGIN issued)', async () => {
    const fake = makeFakeDatabaseClient({});
    await insertAnalyticsEventBatch(fake.database, []);
    assert.equal(fake.recorded.length, 0);
    assert.equal(fake.connectCalls.count, 0);
  });

  test('insertAnalyticsEventBatch wraps multi-row INSERT in a BEGIN/COMMIT transaction with column-enumerated INSERT (D-20501 atomicity + column list)', async () => {
    const fake = makeFakeDatabaseClient({});
    const rows: readonly AnalyticsEventRow[] = [
      makeRow({ eventType: 'direct', sessionId: 'session-1' }),
      makeRow({ eventType: 'signup-complete', sessionId: 'session-1', userIdHash: 'a'.repeat(64) }),
    ];
    await insertAnalyticsEventBatch(fake.database, rows);
    const sqls = fake.recorded.map((entry) => entry.sql);
    assert.equal(sqls[0], 'BEGIN');
    assert.equal(sqls[sqls.length - 1], 'COMMIT');
    const insertSql = sqls.find((sql) => sql.includes('INSERT INTO legendary.analytics_events')) ?? '';
    assert.match(
      insertSql,
      /\(\s*event_type,\s*user_id_hash,\s*session_id,\s*ts,\s*properties\s*\)/,
      'Batch INSERT MUST enumerate target columns explicitly per D-20501.',
    );
    // why: D-20501 atomicity — the connect/release pair confirms the
    // BEGIN+INSERT+COMMIT run on a single checked-out client.
    assert.equal(fake.connectCalls.count, 1);
    assert.equal(fake.releaseCalls.count, 1);
  });

  test('insertAnalyticsEventBatch rolls back and re-throws on mid-batch DB error (D-20501 atomicity invariant)', async () => {
    const sqls: string[] = [];
    const fake = makeFakeDatabaseClient({
      throwOnQuery: (sql) => {
        sqls.push(sql);
        if (sql.includes('INSERT INTO legendary.analytics_events')) {
          return new Error('simulated DB failure mid-batch');
        }
        return null;
      },
    });
    const rows: readonly AnalyticsEventRow[] = [makeRow()];
    await assert.rejects(
      insertAnalyticsEventBatch(fake.database, rows),
      /simulated DB failure mid-batch/,
    );
    const recordedSqls = fake.recorded.map((entry) => entry.sql);
    // why: D-20501 atomicity invariant — on any mid-batch error the
    // ROLLBACK MUST fire before the error re-throws. The client is
    // still released via the finally branch.
    assert.equal(recordedSqls[0], 'BEGIN');
    assert.equal(
      recordedSqls.includes('ROLLBACK'),
      true,
      'ROLLBACK MUST fire on any thrown DB error per D-20501 — partial-success is forbidden.',
    );
    assert.equal(fake.releaseCalls.count, 1);
  });

  test('insertAnalyticsEventBatch throws (without issuing SQL) when a row carries an out-of-set event_type (logic-layer defense-in-depth)', async () => {
    const fake = makeFakeDatabaseClient({});
    const rows: readonly AnalyticsEventRow[] = [
      makeRow({ eventType: 'direct' }),
      makeRow({ eventType: 'unknown-channel', sessionId: 'session-2' }),
    ];
    await assert.rejects(
      insertAnalyticsEventBatch(fake.database, rows),
      /out-of-set event_type/,
    );
    assert.equal(
      fake.recorded.length,
      0,
      'Pre-flight validation MUST fail BEFORE BEGIN — zero rows committed when any row is out-of-set.',
    );
    assert.equal(fake.connectCalls.count, 0);
  });
});

describe('getTrafficSources (WP-205 / D-20501 channel attribution)', () => {
  test('SQL uses ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ts ASC) window function (D-20501 tightening)', async () => {
    const fake = makeFakeDatabaseClient({ cannedRows: [{ rows: [] }] });
    await getTrafficSources(fake.database, '14d');
    const trafficSourcesSql = fake.recorded[0]?.sql ?? '';
    assert.match(
      trafficSourcesSql,
      /ROW_NUMBER\(\) OVER \(PARTITION BY session_id ORDER BY ts ASC\)/,
      'Channel attribution MUST use the locked window function per D-20501 tightening — MIN(ts) subquery + GROUP BY is FORBIDDEN.',
    );
    // why: D-20501 — no-channel sessions are EXCLUDED entirely (no
    // `direct` fallback). The filter `WHERE event_type IN (4
    // channel events)` inside `channel_events` excludes any session
    // whose only events are activation/retention; sessions with no
    // channel event simply do not appear in the result. The SQL
    // pre-sorted invariant is enforced by ORDER BY in the outer SELECT.
    assert.match(
      trafficSourcesSql,
      /ORDER BY fc\.channel ASC, \(fc\.ts AT TIME ZONE 'UTC'\)::date ASC/,
      'Output MUST be SQL-pre-sorted ascending by (channel, date) per D-20501 SQL pre-sorted invariant.',
    );
  });

  test('returns mapped rows matching the locked TrafficSource envelope shape (no source/updatedAt fields)', async () => {
    const fake = makeFakeDatabaseClient({
      cannedRows: [
        {
          rows: [
            {
              channel: 'direct',
              date: '2026-05-25',
              visitor_count: '42',
              signup_count: '7',
            },
            {
              channel: 'search',
              date: '2026-05-26',
              visitor_count: 13,
              signup_count: 2,
            },
          ],
        },
      ],
    });
    const result = await getTrafficSources(fake.database, '7d');
    assert.deepStrictEqual(result, [
      { channel: 'direct', date: '2026-05-25', visitorCount: 42, signupCount: 7 },
      { channel: 'search', date: '2026-05-26', visitorCount: 13, signupCount: 2 },
    ]);
    // why: D-20503 envelope shape — server returns bare data; the
    // dashboard's future LIVE-flip wrapper adds source/updatedAt at
    // the call site. The result MUST be an array, not a wrapper
    // object.
    for (const row of result) {
      assert.equal('source' in row, false);
      assert.equal('updatedAt' in row, false);
    }
  });

  test('returns empty array when DB returns no rows (zero-denominator / empty-data path)', async () => {
    const fake = makeFakeDatabaseClient({ cannedRows: [{ rows: [] }] });
    const result = await getTrafficSources(fake.database, '90d');
    assert.deepStrictEqual(result, []);
  });
});

describe('getActivationFunnel + getRetentionCohorts (WP-205 / D-20501)', () => {
  test('getActivationFunnel SQL excludes anonymous events from DISTINCT user-id-hash counts and applies UTC date bucket + ascending sort', async () => {
    const fake = makeFakeDatabaseClient({ cannedRows: [{ rows: [] }] });
    await getActivationFunnel(fake.database, '30d');
    const funnelSql = fake.recorded[0]?.sql ?? '';
    // why: D-20501 — `user_id_hash IS NOT NULL` keeps anonymous
    // events out of the DISTINCT user-id-hash count for step-level
    // aggregations (anonymous events contribute to visitor counts
    // via DISTINCT session_id but cannot be deduped at the user
    // level without an identity). UTC bucket via the AT TIME ZONE
    // clause; ascending sort via the ORDER BY clause.
    assert.match(funnelSql, /AND user_id_hash IS NOT NULL/);
    assert.match(funnelSql, /\(ts AT TIME ZONE 'UTC'\)::date/);
    assert.match(funnelSql, /ORDER BY event_type ASC, \(ts AT TIME ZONE 'UTC'\)::date ASC/);
  });

  test('getActivationFunnel maps DB rows to ActivationFunnelStep envelope (4-step closed set)', async () => {
    const fake = makeFakeDatabaseClient({
      cannedRows: [
        {
          rows: [
            { step: 'signup-start', date: '2026-05-25', count: '100' },
            { step: 'signup-complete', date: '2026-05-25', count: '60' },
            { step: 'first-match-started', date: '2026-05-25', count: '45' },
            { step: 'first-match-completed', date: '2026-05-25', count: '30' },
          ],
        },
      ],
    });
    const result = await getActivationFunnel(fake.database, '14d');
    assert.deepStrictEqual(result, [
      { step: 'signup-start', date: '2026-05-25', count: 100 },
      { step: 'signup-complete', date: '2026-05-25', count: 60 },
      { step: 'first-match-started', date: '2026-05-25', count: 45 },
      { step: 'first-match-completed', date: '2026-05-25', count: 30 },
    ]);
  });

  test('getRetentionCohorts SQL excludes signup-complete from dayN return windows (D-20501 v1 coarse return definition)', async () => {
    const fake = makeFakeDatabaseClient({ cannedRows: [{ rows: [] }] });
    await getRetentionCohorts(fake.database, 8);
    const cohortsSql = fake.recorded[0]?.sql ?? '';
    // why: D-20501 v1 coarse — a "return" event for cohort day-N is
    // ANY event where `event_type != 'signup-complete'` AND
    // `user_id_hash` matches the cohort AND `ts` falls in day-N of
    // that user's cohort window. The SQL EXISTS clauses MUST
    // exclude signup-complete from the day-1 and day-7 windows.
    assert.match(cohortsSql, /event_type != 'signup-complete'/);
    // why: D-20501 — ISO 8601 week label via the locked SQL formula.
    assert.match(
      cohortsSql,
      /to_char\(date_trunc\('week', ts\), 'IYYY-"W"IW'\)/,
    );
    // why: D-20501 SQL pre-sorted invariant — ascending sort by
    // cohort_week from SQL ORDER BY; route MUST NOT re-sort.
    assert.match(cohortsSql, /ORDER BY ci\.cohort_week ASC/);
  });

  test('getRetentionCohorts maps DB rows to RetentionCohort envelope with numeric counts', async () => {
    const fake = makeFakeDatabaseClient({
      cannedRows: [
        {
          rows: [
            {
              cohort_week: '2026-W22',
              cohort_size: '50',
              day1_return_count: '20',
              day7_return_count: '15',
            },
            {
              cohort_week: '2026-W23',
              cohort_size: 40,
              day1_return_count: 18,
              day7_return_count: 10,
            },
          ],
        },
      ],
    });
    const result = await getRetentionCohorts(fake.database, 8);
    assert.deepStrictEqual(result, [
      {
        cohortWeek: '2026-W22',
        cohortSize: 50,
        day1ReturnCount: 20,
        day7ReturnCount: 15,
      },
      {
        cohortWeek: '2026-W23',
        cohortSize: 40,
        day1ReturnCount: 18,
        day7ReturnCount: 10,
      },
    ]);
  });

  test('getRetentionCohorts returns empty array when no signup-complete events exist', async () => {
    const fake = makeFakeDatabaseClient({ cannedRows: [{ rows: [] }] });
    const result = await getRetentionCohorts(fake.database, 8);
    assert.deepStrictEqual(result, []);
  });
});

describe('SQL-source grep gates (WP-205 / D-20501 + D-20502)', () => {
  test('every INSERT INTO legendary.analytics_events in the source enumerates target columns (D-20501 INSERT discipline)', async () => {
    const source = await readFile(LOGIC_SOURCE_PATH, 'utf8');
    // why: positional-bind form is FORBIDDEN — `VALUES (...)`
    // immediately following the table name with no column list
    // would silently shift binds if a future migration adds a
    // column. Match captures any occurrence and asserts the form
    // includes a column list `(col1, col2, ...)` BEFORE `VALUES`.
    const forbiddenPattern = /INSERT INTO legendary\.analytics_events\s+VALUES/g;
    const forbiddenMatches = source.match(forbiddenPattern) ?? [];
    assert.equal(
      forbiddenMatches.length,
      0,
      'D-20501 INSERT discipline HARD FAIL: found positional-bind INSERT (no column list) in analytics.logic.ts source. Every INSERT MUST enumerate target columns.',
    );
    const columnListPattern = /INSERT INTO legendary\.analytics_events\s*\n?\s*\(\s*event_type,/g;
    const columnListMatches = source.match(columnListPattern) ?? [];
    assert.equal(
      columnListMatches.length >= 2,
      true,
      `Expected at least 2 column-list-enumerated INSERTs (single + batch paths) per D-20501; found ${columnListMatches.length}.`,
    );
  });

  test('source does NOT bind raw user_id in any INSERT column-binding path (D-20502 PII invariant)', async () => {
    const source = await readFile(LOGIC_SOURCE_PATH, 'utf8');
    // why: D-20502 — raw `user_id` MUST NEVER appear in any
    // INSERT bind path. The column the server writes is
    // `user_id_hash` (already hashed at the route boundary). A
    // grep over the source asserts the only matches for the
    // bareword `user_id` (not `user_id_hash`) are within the type
    // definitions or `// why:` comments — never inside INSERT
    // statement column lists.
    const lines = source.split('\n');
    const insertColumnLines = lines.filter((line) =>
      /INSERT INTO legendary\.analytics_events/.test(line) ||
      /\(\s*event_type,\s*user_id_hash,\s*session_id,\s*ts,\s*properties\s*\)/.test(line),
    );
    for (const line of insertColumnLines) {
      // why: `user_id_hash` and `user_id` are matched separately
      // via a negative-lookahead boundary. The column-list lines
      // MUST contain `user_id_hash` and MUST NOT contain bare
      // `user_id` (not followed by `_hash`).
      const bareUserIdMatch = /user_id(?!_hash)/.exec(line);
      if (bareUserIdMatch !== null) {
        // why: only acceptable bare `user_id` occurrence in an
        // INSERT-context line is a comment fragment, which we
        // exclude here by checking the line is not part of a
        // comment block.
        assert.equal(
          line.trim().startsWith('//') || line.trim().startsWith('*'),
          true,
          `D-20502 leakage gate: bare 'user_id' found in INSERT column-binding line: "${line.trim()}". Raw user_id MUST NEVER be persisted; the column is user_id_hash.`,
        );
      }
    }
  });
});
