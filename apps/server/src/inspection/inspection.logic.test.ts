/**
 * Tests for inspection logic — WP-231 / EC-263.
 *
 * Uses a recording fake `DatabaseClient` (records SQL + values; returns canned
 * rows). No real PostgreSQL. Covers the deterministic verdict truth table, the
 * server-authoritative recompute on insert (D-23101), the duplicate-error path,
 * latest/recent ordering, the severity/route drift gates, and the findings
 * JSON round-trip stability (the copilot follow-up).
 *
 * Per D-23102 no test asserts finding TEXT or re-run stability — only shape,
 * the server-recomputed derived values, and the JSON serializability of the
 * stored findings.
 *
 * Authority: WP-231 §Acceptance Criteria #2 + #9 + #23; EC-263 §After
 * Completing; D-23101 (derived-field authority); D-23102 (nondeterministic
 * findings / deterministic verdict).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseClient } from './inspection.logic.js';
import {
  InspectionReportDuplicateError,
  deriveVerdict,
  fetchLatestInspectionReport,
  fetchRecentInspectionReports,
  insertInspectionReport,
} from './inspection.logic.js';
import type {
  InspectionFinding,
  InspectionReportPayload,
  InspectionSeverity,
  InspectionRoute,
} from './inspection.types.js';
import { INSPECTION_SEVERITIES, INSPECTION_ROUTES } from './inspection.types.js';

interface QueryRecorder {
  readonly database: DatabaseClient;
  readonly recorded: Array<{ sql: string; values: readonly unknown[] }>;
  setNextResult(rows: Array<Record<string, unknown>>): void;
  throwOnInsert(error: unknown): void;
}

function makeQueryRecorder(): QueryRecorder {
  const recorded: Array<{ sql: string; values: readonly unknown[] }> = [];
  let nextRows: Array<Record<string, unknown>> = [];
  let insertError: unknown = null;
  const handleQuery = async (
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> => {
    recorded.push({ sql, values: values ?? [] });
    if (insertError !== null && /INSERT INTO legendary\.inspection_reports/.test(sql)) {
      const errorToThrow = insertError;
      insertError = null;
      throw errorToThrow;
    }
    return { rows: nextRows };
  };
  const database = { query: handleQuery } as unknown as DatabaseClient;
  return {
    database,
    recorded,
    setNextResult(rows) {
      nextRows = rows;
    },
    throwOnInsert(error) {
      insertError = error;
    },
  };
}

function makeFinding(overrides: Partial<InspectionFinding> = {}): InspectionFinding {
  return {
    severity: 'P2',
    anomalyClass: 'not-endgame',
    cellId: 'scheme-a:mastermind-b',
    description: 'A representative full-sentence finding describing the anomaly.',
    route: 'Builder',
    ...overrides,
  };
}

function makePayload(
  findings: readonly InspectionFinding[],
  overrides: Partial<InspectionReportPayload> = {},
): InspectionReportPayload {
  return {
    reportId: 'a1b2c3d4-20260610T071500Z-20260610T071530Z',
    sweepRunId: 'a1b2c3d4-20260610T071500Z',
    generatedAt: '2026-06-10T07:15:30.000Z',
    verdict: 'PASS',
    findings,
    ...overrides,
  };
}

describe('deriveVerdict (WP-231 / D-23101 truth table)', () => {
  test('should_return_PASS_for_no_findings', () => {
    assert.equal(deriveVerdict([]), 'PASS');
  });

  test('should_return_PASS_when_only_P2_findings', () => {
    assert.equal(deriveVerdict([makeFinding({ severity: 'P2' }), makeFinding({ severity: 'P2' })]), 'PASS');
  });

  test('should_return_FAIL_when_any_P1_finding', () => {
    assert.equal(deriveVerdict([makeFinding({ severity: 'P2' }), makeFinding({ severity: 'P1' })]), 'FAIL');
  });

  test('should_return_FAIL_when_any_P0_finding', () => {
    assert.equal(deriveVerdict([makeFinding({ severity: 'P0' })]), 'FAIL');
  });
});

describe('insertInspectionReport (WP-231 / D-23101 server-authoritative derive)', () => {
  test('should_recompute_verdict_and_counts_and_ignore_client_verdict', async () => {
    const recorder = makeQueryRecorder();
    // why (AC #6 + #23): client sent verdict PASS + would-be-wrong counts, but
    // the findings carry a P0 — the server recomputes FAIL and the per-severity
    // counts, storing THOSE.
    const findings = [
      makeFinding({ severity: 'P0' }),
      makeFinding({ severity: 'P1' }),
      makeFinding({ severity: 'P2' }),
      makeFinding({ severity: 'P2' }),
    ];
    const stored = await insertInspectionReport(
      recorder.database,
      makePayload(findings, { verdict: 'PASS' }),
    );
    assert.equal(stored.verdict, 'FAIL');
    assert.equal(stored.p0Count, 1);
    assert.equal(stored.p1Count, 1);
    assert.equal(stored.p2Count, 2);
    // the bound INSERT values carry the server-recomputed verdict + counts,
    // never the client's PASS.
    const insert = recorder.recorded.find((entry) => /INSERT INTO legendary\.inspection_reports/.test(entry.sql));
    assert.ok(insert, 'an INSERT must be issued');
    assert.equal(insert.values[3], 'FAIL'); // verdict column
    assert.equal(insert.values[4], 1); // p0_count
    assert.equal(insert.values[5], 1); // p1_count
    assert.equal(insert.values[6], 2); // p2_count
  });

  test('should_omit_submitted_at_and_enumerate_columns_explicitly', async () => {
    const recorder = makeQueryRecorder();
    await insertInspectionReport(recorder.database, makePayload([makeFinding()]));
    const insert = recorder.recorded.find((entry) => /INSERT INTO legendary\.inspection_reports/.test(entry.sql));
    assert.ok(insert);
    assert.match(insert.sql, /INSERT INTO legendary\.inspection_reports \(report_id, sweep_run_id, generated_at, verdict, p0_count, p1_count, p2_count, findings\)/);
    assert.doesNotMatch(insert.sql, /submitted_at/);
  });

  test('should_throw_InspectionReportDuplicateError_on_unique_violation', async () => {
    const recorder = makeQueryRecorder();
    recorder.throwOnInsert({ code: '23505' });
    await assert.rejects(
      () => insertInspectionReport(recorder.database, makePayload([makeFinding()])),
      InspectionReportDuplicateError,
    );
  });

  test('should_serialize_findings_as_a_lossless_JSON_round_trip', async () => {
    // why (copilot follow-up): the stored `findings` JSONB must round-trip
    // losslessly so the GET read returns exactly what the agent submitted —
    // guards against an accidental Date / undefined leaking into a finding.
    const recorder = makeQueryRecorder();
    const findings = [
      makeFinding({ severity: 'P0', cellId: null, anomalyClass: 'meta' }),
      makeFinding({ severity: 'P2', cellId: 'scheme-x:mastermind-y' }),
    ];
    await insertInspectionReport(recorder.database, makePayload(findings));
    const insert = recorder.recorded.find((entry) => /INSERT INTO legendary\.inspection_reports/.test(entry.sql));
    assert.ok(insert);
    const serialized = insert.values[7] as string;
    assert.deepEqual(JSON.parse(serialized), findings);
  });
});

describe('fetchLatest / fetchRecent inspection reports (WP-231 / D-23101 ordering)', () => {
  test('should_return_null_when_table_is_empty', async () => {
    const recorder = makeQueryRecorder();
    recorder.setNextResult([]);
    const latest = await fetchLatestInspectionReport(recorder.database);
    assert.equal(latest, null);
  });

  test('should_map_row_to_summary_with_nested_counts_and_iso_timestamps', async () => {
    const recorder = makeQueryRecorder();
    recorder.setNextResult([
      {
        report_id: 'r1',
        sweep_run_id: 's1',
        submitted_at: new Date('2026-06-10T07:15:31.000Z'),
        generated_at: new Date('2026-06-10T07:15:30.000Z'),
        verdict: 'FAIL',
        p0_count: 1,
        p1_count: 0,
        p2_count: 2,
        findings: [makeFinding({ severity: 'P0' })],
      },
    ]);
    const latest = await fetchLatestInspectionReport(recorder.database);
    assert.ok(latest);
    assert.equal(latest.reportId, 'r1');
    assert.equal(latest.sweepRunId, 's1');
    assert.equal(latest.submittedAt, '2026-06-10T07:15:31.000Z');
    assert.equal(latest.generatedAt, '2026-06-10T07:15:30.000Z');
    assert.equal(latest.verdict, 'FAIL');
    assert.deepEqual(latest.counts, { p0: 1, p1: 0, p2: 2 });
    assert.equal(latest.findings.length, 1);
  });

  test('should_order_recent_reports_by_submitted_at_desc_limit_30', async () => {
    const recorder = makeQueryRecorder();
    recorder.setNextResult([]);
    await fetchRecentInspectionReports(recorder.database);
    const select = recorder.recorded[0];
    assert.ok(select);
    assert.match(select.sql, /ORDER BY submitted_at DESC LIMIT 30/);
  });
});

describe('severity / route canonical-array drift gates (WP-231 / AC #2)', () => {
  test('should_pin_INSPECTION_SEVERITIES_to_the_union_members', () => {
    // forward + backward inclusion against the closed union's literal members.
    const expected: readonly InspectionSeverity[] = ['P0', 'P1', 'P2'];
    assert.deepEqual([...INSPECTION_SEVERITIES], [...expected]);
  });

  test('should_pin_INSPECTION_ROUTES_to_the_union_members', () => {
    const expected: readonly InspectionRoute[] = ['Builder', 'Architect'];
    assert.deepEqual([...INSPECTION_ROUTES], [...expected]);
  });
});
