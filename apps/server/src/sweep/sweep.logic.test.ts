/**
 * Tests for sweep logic — WP-209 / EC-241 Sub-task B.
 *
 * Tests use a fake `DatabaseClient` that records SQL + values and returns
 * canned `{ rows }` results. No real PostgreSQL, no `pool.connect()` calls
 * (the sweep logic uses single-statement `pool.query` only — no batch
 * transactions).
 *
 * Authority: WP-209 §Acceptance Criteria #10 (explicit INSERT column list) +
 * #13 (recentRuns ordering); EC-241 §After Completing grep gates; D-20701
 * (storage shape lock); D-19502 (sweep anomaly 4-class closed taxonomy
 * carry-forward).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseClient } from './sweep.logic.js';
import {
  SweepRunDuplicateError,
  fetchLatestSweepRun,
  fetchRecentSweepRuns,
  insertSweepRun,
} from './sweep.logic.js';
import type { SweepRunPayload } from './sweep.types.js';

interface RecordedQuery {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface QueryFake {
  readonly database: DatabaseClient;
  readonly recorded: RecordedQuery[];
}

function makeQueryFake(cannedRows: Array<{ rows: Array<Record<string, unknown>> }>): QueryFake {
  const recorded: RecordedQuery[] = [];
  let cannedIndex = 0;
  const handleQuery = async (
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> => {
    recorded.push({ sql, values: values ?? [] });
    const next = cannedRows[cannedIndex] ?? { rows: [] };
    cannedIndex = cannedIndex + 1;
    return next;
  };
  const database = {
    query: handleQuery,
  } as unknown as DatabaseClient;
  return { database, recorded };
}

function makeQueryFakeThrowing(error: unknown): QueryFake {
  const recorded: RecordedQuery[] = [];
  const handleQuery = async (
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> => {
    recorded.push({ sql, values: values ?? [] });
    throw error;
  };
  const database = {
    query: handleQuery,
  } as unknown as DatabaseClient;
  return { database, recorded };
}

const VALID_PAYLOAD: SweepRunPayload = {
  runId: 'a1b2c3d-20260604T070000Z',
  startedAt: '2026-06-04T06:59:00.000Z',
  cellCount: 4,
  anomalyCounts: {
    'endgame-reached': 2,
    'not-endgame': 1,
    'escaped-villain-cap': 1,
    'fatal': 0,
  },
  manifestBlob: { cells: [], summary: {}, malformedLines: [] },
};

describe('insertSweepRun (WP-209 / D-20701)', () => {
  test('should_emit_explicit_column_list_when_inserting_a_valid_payload', async () => {
    const fake = makeQueryFake([]);
    await insertSweepRun(fake.database, VALID_PAYLOAD);
    assert.equal(fake.recorded.length, 1);
    const insertSql = fake.recorded[0]!.sql;
    // why (D-20701): explicit-column-list grep — positional inserts forbidden;
    // the literal column list is grep-pinned by EC-241 §After Completing and
    // the AC #10 verification step.
    assert.ok(
      /INSERT INTO legendary\.sweep_runs\s*\(run_id, started_at, cell_count, anomaly_counts, manifest_blob\)/.test(
        insertSql,
      ),
      `INSERT statement MUST list the 5 columns explicitly per D-20701; got: ${insertSql}`,
    );
    // why (D-20701): `submitted_at` is omitted from every INSERT column list —
    // column DEFAULT `NOW()` populates the submission wall-clock server-side.
    assert.ok(
      /submitted_at/.test(insertSql) === false,
      `INSERT MUST NOT mention submitted_at per D-20701; got: ${insertSql}`,
    );
  });

  test('should_bind_payload_values_in_locked_positional_order', async () => {
    const fake = makeQueryFake([]);
    await insertSweepRun(fake.database, VALID_PAYLOAD);
    const insertValues = fake.recorded[0]!.values;
    assert.equal(insertValues[0], VALID_PAYLOAD.runId);
    assert.equal(insertValues[1], VALID_PAYLOAD.startedAt);
    assert.equal(insertValues[2], VALID_PAYLOAD.cellCount);
    assert.equal(insertValues[3], JSON.stringify(VALID_PAYLOAD.anomalyCounts));
    assert.equal(insertValues[4], JSON.stringify(VALID_PAYLOAD.manifestBlob));
  });

  test('should_bind_null_for_manifestBlob_when_payload_omits_it', async () => {
    const fake = makeQueryFake([]);
    const payloadWithoutBlob: SweepRunPayload = {
      ...VALID_PAYLOAD,
      manifestBlob: undefined,
    };
    await insertSweepRun(fake.database, payloadWithoutBlob);
    const insertValues = fake.recorded[0]!.values;
    assert.equal(
      insertValues[4],
      null,
      'manifestBlob: undefined MUST bind SQL NULL so the column DEFAULT NULL applies',
    );
  });

  test('should_throw_SweepRunDuplicateError_on_postgres_unique_violation', async () => {
    const uniqueViolationError = Object.assign(new Error('unique_violation'), {
      code: '23505',
    });
    const fake = makeQueryFakeThrowing(uniqueViolationError);
    await assert.rejects(
      async () => {
        await insertSweepRun(fake.database, VALID_PAYLOAD);
      },
      (error: unknown) => {
        assert.ok(
          error instanceof SweepRunDuplicateError,
          'PRIMARY KEY collision MUST surface as SweepRunDuplicateError per D-20701',
        );
        assert.equal((error as SweepRunDuplicateError).runId, VALID_PAYLOAD.runId);
        return true;
      },
    );
  });

  test('should_propagate_non_unique_violation_errors_unchanged', async () => {
    const genericError = Object.assign(new Error('connection_refused'), {
      code: '08006',
    });
    const fake = makeQueryFakeThrowing(genericError);
    await assert.rejects(
      async () => {
        await insertSweepRun(fake.database, VALID_PAYLOAD);
      },
      (error: unknown) => {
        assert.ok(
          error instanceof SweepRunDuplicateError === false,
          'Non-unique-violation errors MUST propagate verbatim to the route layer (mapped to 500)',
        );
        return true;
      },
    );
  });
});

describe('fetchLatestSweepRun (WP-209 / D-20701)', () => {
  test('should_return_null_when_table_is_empty', async () => {
    const fake = makeQueryFake([{ rows: [] }]);
    const result = await fetchLatestSweepRun(fake.database);
    assert.equal(result, null);
  });

  test('should_order_by_submitted_at_DESC_with_LIMIT_1', async () => {
    const fake = makeQueryFake([{ rows: [] }]);
    await fetchLatestSweepRun(fake.database);
    const sql = fake.recorded[0]!.sql;
    assert.ok(
      /ORDER BY submitted_at DESC/.test(sql),
      `fetchLatestSweepRun MUST order by submitted_at DESC per D-20701; got: ${sql}`,
    );
    assert.ok(
      /LIMIT 1/.test(sql),
      `fetchLatestSweepRun MUST cap at LIMIT 1; got: ${sql}`,
    );
  });
});

describe('fetchRecentSweepRuns (WP-209 / D-20701)', () => {
  test('should_emit_literal_ORDER_BY_submitted_at_DESC_LIMIT_30', async () => {
    const fake = makeQueryFake([{ rows: [] }]);
    await fetchRecentSweepRuns(fake.database);
    const sql = fake.recorded[0]!.sql;
    // why (D-20701 / AC #13): the literal `ORDER BY submitted_at DESC LIMIT 30`
    // is grep-pinned by EC-241 §After Completing and the WP-209 §Verification
    // Steps #12. The BTREE index `sweep_runs_submitted_at_desc_idx` exists
    // precisely to serve this query path.
    assert.ok(
      /ORDER BY submitted_at DESC LIMIT 30/.test(sql),
      `fetchRecentSweepRuns MUST emit the literal "ORDER BY submitted_at DESC LIMIT 30" per D-20701; got: ${sql}`,
    );
  });

  test('should_map_snake_case_columns_to_camelCase_summary_fields', async () => {
    const submittedAt = new Date('2026-06-04T07:00:00.000Z');
    const startedAt = new Date('2026-06-04T06:59:00.000Z');
    const fake = makeQueryFake([
      {
        rows: [
          {
            run_id: 'abc123-20260604T070000Z',
            submitted_at: submittedAt,
            started_at: startedAt,
            cell_count: 4,
            anomaly_counts: {
              'endgame-reached': 2,
              'not-endgame': 1,
              'escaped-villain-cap': 1,
              'fatal': 0,
            },
          },
        ],
      },
    ]);
    const result = await fetchRecentSweepRuns(fake.database);
    assert.equal(result.length, 1);
    const row = result[0]!;
    assert.equal(row.runId, 'abc123-20260604T070000Z');
    assert.equal(row.submittedAt, submittedAt.toISOString());
    assert.equal(row.startedAt, startedAt.toISOString());
    assert.equal(row.cellCount, 4);
    assert.deepStrictEqual(row.anomalyCounts, {
      'endgame-reached': 2,
      'not-endgame': 1,
      'escaped-villain-cap': 1,
      'fatal': 0,
    });
  });

  test('should_NOT_call_Array_sort_on_the_result_set', async () => {
    // why (D-20701): SQL `ORDER BY submitted_at DESC` is authoritative; the
    // logic layer MUST NOT post-sort. This test asserts the DB-row order is
    // preserved verbatim — submitting rows in [latest, mid, earliest] order
    // returns them in that exact order regardless of submittedAt comparison
    // semantics in JS.
    const fake = makeQueryFake([
      {
        rows: [
          {
            run_id: 'C',
            submitted_at: new Date('2026-06-04T03:00:00.000Z'),
            started_at: new Date('2026-06-04T02:59:00.000Z'),
            cell_count: 4,
            anomaly_counts: { 'endgame-reached': 4, 'not-endgame': 0, 'escaped-villain-cap': 0, 'fatal': 0 },
          },
          {
            run_id: 'B',
            submitted_at: new Date('2026-06-04T02:00:00.000Z'),
            started_at: new Date('2026-06-04T01:59:00.000Z'),
            cell_count: 4,
            anomaly_counts: { 'endgame-reached': 4, 'not-endgame': 0, 'escaped-villain-cap': 0, 'fatal': 0 },
          },
          {
            run_id: 'A',
            submitted_at: new Date('2026-06-04T01:00:00.000Z'),
            started_at: new Date('2026-06-04T00:59:00.000Z'),
            cell_count: 4,
            anomaly_counts: { 'endgame-reached': 4, 'not-endgame': 0, 'escaped-villain-cap': 0, 'fatal': 0 },
          },
        ],
      },
    ]);
    const result = await fetchRecentSweepRuns(fake.database);
    assert.deepStrictEqual(
      result.map((row) => row.runId),
      ['C', 'B', 'A'],
      'fetchRecentSweepRuns MUST preserve DB row order verbatim — no post-sort per D-20701',
    );
  });

  test('should_return_empty_array_when_table_is_empty', async () => {
    const fake = makeQueryFake([{ rows: [] }]);
    const result = await fetchRecentSweepRuns(fake.database);
    assert.equal(result.length, 0);
  });
});
