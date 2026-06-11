/**
 * Tests for handoff logic — WP-232 / EC-264.
 *
 * Uses a recording fake `DatabaseClient` (records every SQL + values; returns
 * canned rows via a per-test `respond` callback keyed on the SQL text). No real
 * PostgreSQL. Covers the status drift gate, the transition truth table, idempotent
 * + source-of-truth sync, the concurrency-guard 0-rows path, the deterministic
 * tie-break, field persistence on transition-away, and the GET ordering.
 *
 * Per D-23102 (inherited) no test asserts finding TEXT — only shape, the
 * lifecycle `status`, and the two reference columns.
 *
 * Authority: WP-232 §Acceptance Criteria #1..#14b + #22 + #23; EC-264 §After
 * Completing; D-23201 (snapshot posture); D-23202 (atomic transition); D-23203
 * (idempotent sync + source-of-truth accessor).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { DatabaseClient } from './handoff.logic.js';
import {
  HandoffNotFoundError,
  HandoffTransitionError,
  applyHandoffTransition,
  countHandoffsByStatus,
  deriveHandoffId,
  fetchLatestHandoffs,
  isAllowedTransition,
  isAnomalyResolved,
  syncHandoffsFromLatestReport,
  verifyFixProposedHandoffs,
} from './handoff.logic.js';
import type { HandoffRecord, HandoffStatus } from './handoff.types.js';
import { HANDOFF_STATUSES } from './handoff.types.js';
import type { InspectionReportSummary } from '../inspection/inspection.types.js';

type RespondFn = (sql: string, values: readonly unknown[], callIndex: number) => Array<Record<string, unknown>>;

interface QueryRecorder {
  readonly database: DatabaseClient;
  readonly recorded: Array<{ sql: string; values: readonly unknown[] }>;
}

function makeRecorder(respond?: RespondFn): QueryRecorder {
  const recorded: Array<{ sql: string; values: readonly unknown[] }> = [];
  const handleQuery = async (
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> => {
    const callIndex = recorded.length;
    recorded.push({ sql, values: values ?? [] });
    const rows = respond ? respond(sql, values ?? [], callIndex) : [];
    return { rows };
  };
  const database = { query: handleQuery } as unknown as DatabaseClient;
  return { database, recorded };
}

function makeInspectionFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    severity: 'P2',
    anomalyClass: 'not-endgame',
    cellId: 'scheme-a:mastermind-b',
    description: 'A representative full-sentence finding describing the anomaly.',
    route: 'Builder',
    ...overrides,
  };
}

function makeInspectionReportRow(
  findings: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    report_id: 'r1-20260610T071500Z-20260610T071530Z',
    sweep_run_id: 'r1-20260610T071500Z',
    submitted_at: new Date('2026-06-10T07:15:31.000Z'),
    generated_at: new Date('2026-06-10T07:15:30.000Z'),
    verdict: 'PASS',
    p0_count: 0,
    p1_count: 0,
    p2_count: findings.length,
    findings,
    ...overrides,
  };
}

function makeHandoffRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    handoff_id: 'r1#0',
    report_id: 'r1',
    sweep_run_id: 's1',
    finding_index: 0,
    severity: 'P2',
    route: 'Builder',
    anomaly_class: 'not-endgame',
    cell_id: 'scheme-a:mastermind-b',
    description: 'A representative full-sentence finding describing the anomaly.',
    status: 'open',
    branch_ref: null,
    amendment_request: null,
    created_at: new Date('2026-06-10T07:15:31.000Z'),
    updated_at: new Date('2026-06-10T07:15:31.000Z'),
    ...overrides,
  };
}

const isInspectionSelect = (sql: string): boolean => /FROM legendary\.inspection_reports/.test(sql);
const isHandoffInsert = (sql: string): boolean => /INSERT INTO legendary\.finding_handoffs/.test(sql);
const isHandoffUpdate = (sql: string): boolean => /UPDATE legendary\.finding_handoffs/.test(sql);
const isHandoffSelect = (sql: string): boolean =>
  /SELECT .* FROM legendary\.finding_handoffs/s.test(sql) && isHandoffUpdate(sql) === false;

describe('HandoffStatus canonical-array drift gate (WP-232 / AC #2)', () => {
  test('should_pin_HANDOFF_STATUSES_to_the_union_members', () => {
    // forward + backward inclusion against the closed union's literal members.
    const expected: readonly HandoffStatus[] = [
      'open',
      'claimed',
      'fix-proposed',
      'escalated',
      'resolved',
      'wont-fix',
    ];
    assert.deepEqual([...HANDOFF_STATUSES], [...expected]);
  });
});

describe('deriveHandoffId (WP-232 / handoffId form)', () => {
  test('should_join_reportId_and_findingIndex_with_a_hash', () => {
    assert.equal(deriveHandoffId('r1-20260610T071500Z-20260610T071530Z', 3), 'r1-20260610T071500Z-20260610T071530Z#3');
  });
});

describe('isAllowedTransition (WP-232 / D-23202 locked table)', () => {
  test('should_allow_only_the_locked_edges_and_reject_everything_else', () => {
    // open -> claimed only.
    assert.equal(isAllowedTransition('open', 'claimed'), true);
    assert.equal(isAllowedTransition('open', 'resolved'), false);
    assert.equal(isAllowedTransition('open', 'fix-proposed'), false);
    // claimed -> fix-proposed | escalated | wont-fix.
    assert.equal(isAllowedTransition('claimed', 'fix-proposed'), true);
    assert.equal(isAllowedTransition('claimed', 'escalated'), true);
    assert.equal(isAllowedTransition('claimed', 'wont-fix'), true);
    assert.equal(isAllowedTransition('claimed', 'resolved'), false);
    // fix-proposed -> resolved | claimed (the WP-233 re-open edge).
    assert.equal(isAllowedTransition('fix-proposed', 'resolved'), true);
    assert.equal(isAllowedTransition('fix-proposed', 'claimed'), true);
    assert.equal(isAllowedTransition('fix-proposed', 'escalated'), false);
    // escalated -> claimed | resolved | wont-fix.
    assert.equal(isAllowedTransition('escalated', 'claimed'), true);
    assert.equal(isAllowedTransition('escalated', 'resolved'), true);
    assert.equal(isAllowedTransition('escalated', 'wont-fix'), true);
    assert.equal(isAllowedTransition('escalated', 'fix-proposed'), false);
    // resolved / wont-fix terminal.
    assert.equal(isAllowedTransition('resolved', 'claimed'), false);
    assert.equal(isAllowedTransition('wont-fix', 'claimed'), false);
  });
});

describe('countHandoffsByStatus (WP-232 / GET counts)', () => {
  test('should_count_each_status_and_sum_to_handoffs_length', () => {
    const handoffs = [
      { status: 'open' },
      { status: 'open' },
      { status: 'claimed' },
      { status: 'fix-proposed' },
      { status: 'escalated' },
      { status: 'resolved' },
      { status: 'wont-fix' },
    ] as unknown as readonly HandoffRecord[];
    const counts = countHandoffsByStatus(handoffs);
    assert.deepEqual(counts, {
      open: 2,
      claimed: 1,
      fixProposed: 1,
      escalated: 1,
      resolved: 1,
      wontFix: 1,
    });
    const total = counts.open + counts.claimed + counts.fixProposed + counts.escalated + counts.resolved + counts.wontFix;
    assert.equal(total, handoffs.length);
  });
});

describe('syncHandoffsFromLatestReport (WP-232 / D-23203 idempotent + source-of-truth)', () => {
  test('should_insert_one_open_row_per_finding_via_the_inspection_accessor', async () => {
    const report = makeInspectionReportRow([makeInspectionFinding(), makeInspectionFinding({ severity: 'P0' })]);
    const recorder = makeRecorder((sql) => {
      if (isInspectionSelect(sql)) {
        return [report];
      }
      if (isHandoffInsert(sql)) {
        return [{ handoff_id: 'created' }];
      }
      return [];
    });
    const summary = await syncHandoffsFromLatestReport(recorder.database);
    assert.deepEqual(summary, {
      reportId: 'r1-20260610T071500Z-20260610T071530Z',
      findingCount: 2,
      created: 2,
      unchanged: 0,
    });
    const inserts = recorder.recorded.filter((entry) => isHandoffInsert(entry.sql));
    assert.equal(inserts.length, 2, 'one INSERT per finding');
    assert.match(
      inserts[0]!.sql,
      /INSERT INTO legendary\.finding_handoffs \(handoff_id, report_id, sweep_run_id, finding_index, severity, route, anomaly_class, cell_id, description, status\)/,
    );
    assert.match(inserts[0]!.sql, /ON CONFLICT \(handoff_id\) DO NOTHING/);
    // The latest report is read ONLY through the inspection accessor — exactly one
    // inspection_reports query, the canonical `submitted_at DESC` accessor form
    // (no hand-rolled / duplicate query in this module). The source-file grep gate
    // (0 `FROM legendary.inspection_reports` in handoff.logic.ts) is the hard
    // enforcement; this asserts the runtime delegation.
    const inspectionReads = recorder.recorded.filter((entry) => isInspectionSelect(entry.sql));
    assert.equal(inspectionReads.length, 1, 'exactly one inspection_reports read (the accessor)');
    assert.match(inspectionReads[0]!.sql, /ORDER BY submitted_at DESC/);
  });

  test('should_be_idempotent_and_preserve_status_on_re_sync', async () => {
    // why (AC #7): on a re-sync the INSERTs conflict (ON CONFLICT DO NOTHING ->
    // RETURNING yields no row), so created=0 and every existing row keeps its
    // current status — a `claimed` row stays `claimed`. No UPDATE is ever issued
    // by sync.
    const report = makeInspectionReportRow([makeInspectionFinding(), makeInspectionFinding()]);
    const recorder = makeRecorder((sql) => {
      if (isInspectionSelect(sql)) {
        return [report];
      }
      // every INSERT conflicts -> no RETURNING row.
      return [];
    });
    const summary = await syncHandoffsFromLatestReport(recorder.database);
    assert.deepEqual(summary, {
      reportId: 'r1-20260610T071500Z-20260610T071530Z',
      findingCount: 2,
      created: 0,
      unchanged: 2,
    });
    assert.equal(
      recorder.recorded.some((entry) => isHandoffUpdate(entry.sql)),
      false,
      'sync issues no UPDATE — re-sync never clobbers a claimed row back to open',
    );
  });

  test('should_return_the_null_report_summary_over_an_empty_inspection_table', async () => {
    const recorder = makeRecorder((sql) => {
      if (isInspectionSelect(sql)) {
        return [];
      }
      return [];
    });
    const summary = await syncHandoffsFromLatestReport(recorder.database);
    assert.deepEqual(summary, { reportId: null, findingCount: 0, created: 0, unchanged: 0 });
    assert.equal(
      recorder.recorded.some((entry) => isHandoffInsert(entry.sql)),
      false,
      'no handoff INSERT when there is no report',
    );
  });
});

describe('applyHandoffTransition (WP-232 / D-23202 atomic + field persistence)', () => {
  test('should_update_status_and_advance_updated_at_on_a_legal_transition', async () => {
    const recorder = makeRecorder((sql) => {
      if (isHandoffUpdate(sql)) {
        return [
          makeHandoffRow({
            status: 'claimed',
            updated_at: new Date('2026-06-10T08:00:00.000Z'),
          }),
        ];
      }
      if (isHandoffSelect(sql)) {
        return [makeHandoffRow({ status: 'open' })];
      }
      return [];
    });
    const updated = await applyHandoffTransition(recorder.database, 'r1#0', {
      handoffId: 'r1#0',
      toStatus: 'claimed',
    });
    assert.equal(updated.status, 'claimed');
    assert.equal(updated.updatedAt, '2026-06-10T08:00:00.000Z');
    const update = recorder.recorded.find((entry) => isHandoffUpdate(entry.sql));
    assert.ok(update, 'an UPDATE must be issued');
    assert.match(update.sql, /AND status = \$5/, 'guarded by the expected-status predicate');
    assert.match(update.sql, /updated_at = NOW\(\)/);
    assert.equal(update.values[4], 'open', 'expectedStatus ($5) bound from the loaded row');
  });

  test('should_throw_HandoffTransitionError_on_an_off_table_transition', async () => {
    const recorder = makeRecorder((sql) => {
      if (isHandoffSelect(sql)) {
        return [makeHandoffRow({ status: 'open' })];
      }
      return [];
    });
    await assert.rejects(
      () => applyHandoffTransition(recorder.database, 'r1#0', { handoffId: 'r1#0', toStatus: 'resolved' }),
      HandoffTransitionError,
    );
    assert.equal(
      recorder.recorded.some((entry) => isHandoffUpdate(entry.sql)),
      false,
      'no UPDATE issued for an off-table transition',
    );
  });

  test('should_throw_HandoffNotFoundError_when_the_row_is_absent', async () => {
    const recorder = makeRecorder(() => []);
    await assert.rejects(
      () => applyHandoffTransition(recorder.database, 'missing#0', { handoffId: 'missing#0', toStatus: 'claimed' }),
      HandoffNotFoundError,
    );
  });

  test('should_map_a_0_row_guarded_update_to_409_when_the_status_moved', async () => {
    // why (AC #11a): the row loads as 'open' (legal open->claimed), but a parallel
    // transition advanced it to 'claimed' before the guarded UPDATE — so the
    // UPDATE matches 0 rows and the re-read sees a different status -> 409
    // (HandoffTransitionError), never a lost update.
    let loadCount = 0;
    const recorder = makeRecorder((sql) => {
      if (isHandoffUpdate(sql)) {
        return []; // guarded UPDATE matches 0 rows (status moved under us).
      }
      if (isHandoffSelect(sql)) {
        loadCount = loadCount + 1;
        // first load: open (expectedStatus); re-read: claimed (moved).
        return [makeHandoffRow({ status: loadCount === 1 ? 'open' : 'claimed' })];
      }
      return [];
    });
    await assert.rejects(
      () => applyHandoffTransition(recorder.database, 'r1#0', { handoffId: 'r1#0', toStatus: 'claimed' }),
      HandoffTransitionError,
    );
    assert.equal(loadCount, 2, 'the 0-rows path re-reads exactly once');
  });

  test('should_map_a_0_row_guarded_update_to_404_when_the_row_was_deleted', async () => {
    let loadCount = 0;
    const recorder = makeRecorder((sql) => {
      if (isHandoffUpdate(sql)) {
        return [];
      }
      if (isHandoffSelect(sql)) {
        loadCount = loadCount + 1;
        return loadCount === 1 ? [makeHandoffRow({ status: 'open' })] : [];
      }
      return [];
    });
    await assert.rejects(
      () => applyHandoffTransition(recorder.database, 'r1#0', { handoffId: 'r1#0', toStatus: 'claimed' }),
      HandoffNotFoundError,
    );
  });

  test('should_preserve_branch_ref_when_transitioning_away_from_fix_proposed', async () => {
    // why (AC #11): a fix-proposed -> claimed transition (the WP-233 re-open edge)
    // must PRESERVE the stored branch_ref (write-on-enter, never cleared). The
    // guarded UPDATE binds the loaded row's branch_ref, not null.
    const recorder = makeRecorder((sql) => {
      if (isHandoffUpdate(sql)) {
        return [makeHandoffRow({ status: 'claimed', branch_ref: 'feature/fix-anomaly' })];
      }
      if (isHandoffSelect(sql)) {
        return [makeHandoffRow({ status: 'fix-proposed', branch_ref: 'feature/fix-anomaly' })];
      }
      return [];
    });
    const updated = await applyHandoffTransition(recorder.database, 'r1#0', {
      handoffId: 'r1#0',
      toStatus: 'claimed',
    });
    assert.equal(updated.branchRef, 'feature/fix-anomaly');
    const update = recorder.recorded.find((entry) => isHandoffUpdate(entry.sql));
    assert.ok(update);
    assert.equal(update.values[2], 'feature/fix-anomaly', 'branch_ref preserved, not nulled');
  });

  test('should_write_branch_ref_only_on_entering_fix_proposed', async () => {
    const recorder = makeRecorder((sql) => {
      if (isHandoffUpdate(sql)) {
        return [makeHandoffRow({ status: 'fix-proposed', branch_ref: 'feature/x' })];
      }
      if (isHandoffSelect(sql)) {
        return [makeHandoffRow({ status: 'claimed' })];
      }
      return [];
    });
    await applyHandoffTransition(recorder.database, 'r1#0', {
      handoffId: 'r1#0',
      toStatus: 'fix-proposed',
      branchRef: 'feature/x',
    });
    const update = recorder.recorded.find((entry) => isHandoffUpdate(entry.sql));
    assert.ok(update);
    assert.equal(update.values[1], 'fix-proposed');
    assert.equal(update.values[2], 'feature/x', 'branch_ref written on entering fix-proposed');
  });
});

describe('fetchLatestHandoffs (WP-232 / D-23201 deterministic ordering)', () => {
  test('should_resolve_the_latest_report_by_created_at_then_report_id_and_order_rows', async () => {
    // why (AC #14a): two reports share a created_at; the lexicographically
    // greatest report_id wins. The fake returns the row real Postgres would return
    // under `ORDER BY created_at DESC, report_id DESC LIMIT 1` (report_id 'r-zzz'),
    // and we assert the SQL carries that deterministic total order + the rows query
    // filters by the resolved id.
    const recorder = makeRecorder((sql, values) => {
      if (/ORDER BY created_at DESC, report_id DESC/.test(sql)) {
        return [{ report_id: 'r-zzz' }];
      }
      if (/WHERE report_id = \$1/.test(sql)) {
        assert.equal(values[0], 'r-zzz', 'rows fetched for the resolved latest report');
        return [makeHandoffRow({ handoff_id: 'r-zzz#0', report_id: 'r-zzz', finding_index: 0 })];
      }
      return [];
    });
    const result = await fetchLatestHandoffs(recorder.database);
    assert.equal(result.reportId, 'r-zzz');
    assert.equal(result.handoffs.length, 1);
    const rowsQuery = recorder.recorded.find((entry) => /WHERE report_id = \$1/.test(entry.sql));
    assert.ok(rowsQuery);
    assert.match(rowsQuery.sql, /ORDER BY finding_index ASC, handoff_id ASC/);
    assert.match(rowsQuery.sql, /LIMIT 500/);
  });

  test('should_return_the_empty_result_when_finding_handoffs_is_empty', async () => {
    const recorder = makeRecorder(() => []);
    const result = await fetchLatestHandoffs(recorder.database);
    assert.deepEqual(result, { reportId: null, handoffs: [] });
  });
});

// ---------------------------------------------------------------------------
// WP-233 / EC-265 — closed-loop verify (additive). The verify flow issues three
// distinguishable SELECTs against finding_handoffs: the bulk fix-proposed load
// (`WHERE status = $1`), and applyHandoffTransition's per-handoff load + re-read
// (`WHERE handoff_id = $1`). These local matchers split them; the module-level
// `isHandoffUpdate` / `isInspectionSelect` are reused.
// ---------------------------------------------------------------------------

const isFixProposedLoad = (sql: string): boolean =>
  /FROM legendary\.finding_handoffs\s+WHERE status = \$1/.test(sql);
const isHandoffByIdLoad = (sql: string): boolean =>
  /FROM legendary\.finding_handoffs WHERE handoff_id = \$1/.test(sql);

describe('isAnomalyResolved (WP-233 / D-23301 strict-equality diff)', () => {
  test('should_apply_the_strict_equality_truth_table_with_no_coercion', () => {
    const runLevelHandoff = { cellId: null, anomalyClass: 'meta' } as unknown as HandoffRecord;
    const cellHandoff = {
      cellId: 'scheme-a:mastermind-b',
      anomalyClass: 'fatal',
    } as unknown as HandoffRecord;
    const reportWith = (findings: Array<Record<string, unknown>>): InspectionReportSummary =>
      ({ findings } as unknown as InspectionReportSummary);

    // run-level null === null is a valid match → anomaly PRESENT → not resolved.
    assert.equal(
      isAnomalyResolved(
        runLevelHandoff,
        reportWith([makeInspectionFinding({ cellId: null, anomalyClass: 'meta' })]),
      ),
      false,
    );
    // a string cellId never matches a null handoff cellId (no coercion) → resolved.
    assert.equal(
      isAnomalyResolved(
        runLevelHandoff,
        reportWith([makeInspectionFinding({ cellId: 'scheme-a:mastermind-b', anomalyClass: 'meta' })]),
      ),
      true,
    );
    // exact (cellId, anomalyClass) match → present → not resolved.
    assert.equal(
      isAnomalyResolved(
        cellHandoff,
        reportWith([makeInspectionFinding({ cellId: 'scheme-a:mastermind-b', anomalyClass: 'fatal' })]),
      ),
      false,
    );
    // same cell, different anomalyClass → no match → resolved (BOTH fields must match).
    assert.equal(
      isAnomalyResolved(
        cellHandoff,
        reportWith([makeInspectionFinding({ cellId: 'scheme-a:mastermind-b', anomalyClass: 'not-endgame' })]),
      ),
      true,
    );
    // different cell, same anomalyClass → no match → resolved.
    assert.equal(
      isAnomalyResolved(
        cellHandoff,
        reportWith([makeInspectionFinding({ cellId: 'scheme-z:mastermind-z', anomalyClass: 'fatal' })]),
      ),
      true,
    );
    // empty findings → nothing matches → resolved.
    assert.equal(isAnomalyResolved(cellHandoff, reportWith([])), true);
  });
});

describe('verifyFixProposedHandoffs (WP-233 / D-23301 closed-loop verify)', () => {
  test('should_transition_a_gone_anomaly_to_resolved_and_count_it_verified', async () => {
    const recorder = makeRecorder((sql, values) => {
      if (isInspectionSelect(sql)) {
        return [makeInspectionReportRow([], { report_id: 'report-new' })];
      }
      if (isFixProposedLoad(sql)) {
        assert.equal(values[0], 'fix-proposed', 'the load binds the fix-proposed status filter');
        return [
          makeHandoffRow({
            handoff_id: 'report-old#0',
            report_id: 'report-old',
            status: 'fix-proposed',
            cell_id: 'scheme-a:mastermind-b',
            anomaly_class: 'fatal',
          }),
        ];
      }
      if (isHandoffByIdLoad(sql)) {
        return [makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: 'fix-proposed' })];
      }
      if (isHandoffUpdate(sql)) {
        return [makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: 'resolved' })];
      }
      return [];
    });
    const summary = await verifyFixProposedHandoffs(recorder.database);
    assert.deepEqual(summary, { reportId: 'report-new', verified: 1, regressed: 0, skipped: 0 });
    const update = recorder.recorded.find((entry) => isHandoffUpdate(entry.sql));
    assert.ok(update, 'a transition UPDATE was issued');
    assert.equal(update.values[1], 'resolved', 'transitioned to resolved');
  });

  test('should_count_one_regressed_even_with_multiple_matching_findings', async () => {
    const matching = { cellId: 'scheme-a:mastermind-b', anomalyClass: 'fatal' };
    const recorder = makeRecorder((sql, values) => {
      if (isInspectionSelect(sql)) {
        // why (multiplicity unweighted): TWO findings match the same handoff's
        // (cellId, anomalyClass); the diff is existential so it counts ONE regressed.
        return [
          makeInspectionReportRow(
            [makeInspectionFinding(matching), makeInspectionFinding(matching)],
            { report_id: 'report-new' },
          ),
        ];
      }
      if (isFixProposedLoad(sql)) {
        return [
          makeHandoffRow({
            handoff_id: 'report-old#0',
            report_id: 'report-old',
            status: 'fix-proposed',
            cell_id: 'scheme-a:mastermind-b',
            anomaly_class: 'fatal',
          }),
        ];
      }
      if (isHandoffByIdLoad(sql)) {
        return [makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: 'fix-proposed' })];
      }
      if (isHandoffUpdate(sql)) {
        return [makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: values[1] })];
      }
      return [];
    });
    const summary = await verifyFixProposedHandoffs(recorder.database);
    assert.deepEqual(summary, { reportId: 'report-new', verified: 0, regressed: 1, skipped: 0 });
    const updates = recorder.recorded.filter((entry) => isHandoffUpdate(entry.sql));
    assert.equal(updates.length, 1, 'exactly one transition despite two matching findings');
    assert.equal(updates[0]!.values[1], 'claimed', 'transitioned to claimed (the re-open edge)');
  });

  test('should_skip_a_same_report_handoff_and_leave_it_fix_proposed', async () => {
    const recorder = makeRecorder((sql) => {
      if (isInspectionSelect(sql)) {
        return [makeInspectionReportRow([], { report_id: 'report-same' })];
      }
      if (isFixProposedLoad(sql)) {
        return [makeHandoffRow({ handoff_id: 'report-same#0', report_id: 'report-same', status: 'fix-proposed' })];
      }
      return [];
    });
    const summary = await verifyFixProposedHandoffs(recorder.database);
    assert.deepEqual(summary, { reportId: 'report-same', verified: 0, regressed: 0, skipped: 1 });
    assert.equal(
      recorder.recorded.some((entry) => isHandoffUpdate(entry.sql)),
      false,
      'no transition for a same-report (no re-sweep) handoff',
    );
    assert.equal(
      recorder.recorded.some((entry) => isHandoffByIdLoad(entry.sql)),
      false,
      'applyHandoffTransition is never invoked for a skipped handoff',
    );
  });

  test('should_return_the_null_report_summary_over_an_empty_inspection_table', async () => {
    const recorder = makeRecorder((sql) => {
      if (isInspectionSelect(sql)) {
        return [];
      }
      return [];
    });
    const summary = await verifyFixProposedHandoffs(recorder.database);
    assert.deepEqual(summary, { reportId: null, verified: 0, regressed: 0, skipped: 0 });
    assert.equal(recorder.recorded.length, 1, 'only the inspection accessor read — no fix-proposed load when there is no report');
    assert.equal(
      recorder.recorded.some((entry) => isFixProposedLoad(entry.sql)),
      false,
    );
  });

  test('should_read_the_latest_report_through_the_inspection_accessor_only', async () => {
    const recorder = makeRecorder((sql) => {
      if (isInspectionSelect(sql)) {
        return [makeInspectionReportRow([], { report_id: 'report-new' })];
      }
      if (isFixProposedLoad(sql)) {
        return [];
      }
      return [];
    });
    await verifyFixProposedHandoffs(recorder.database);
    // The source-file grep gate (0 `FROM legendary.inspection_reports` in
    // handoff.logic.ts) is the hard enforcement; this asserts the runtime
    // delegation — exactly one inspection read, the canonical accessor form.
    const inspectionReads = recorder.recorded.filter((entry) => isInspectionSelect(entry.sql));
    assert.equal(inspectionReads.length, 1, 'exactly one inspection_reports read (the accessor)');
    assert.match(inspectionReads[0]!.sql, /ORDER BY submitted_at DESC/);
  });

  test('should_load_only_fix_proposed_handoffs_via_the_status_filter', async () => {
    // why (AC #6): the `WHERE status = 'fix-proposed'` filter is the mechanism
    // that keeps open / claimed / escalated / resolved / wont-fix rows out of the
    // verify loop — they are never read, never transitioned.
    const recorder = makeRecorder((sql, values) => {
      if (isInspectionSelect(sql)) {
        return [makeInspectionReportRow([], { report_id: 'report-new' })];
      }
      if (isFixProposedLoad(sql)) {
        assert.equal(values[0], 'fix-proposed');
        return [];
      }
      return [];
    });
    const summary = await verifyFixProposedHandoffs(recorder.database);
    assert.deepEqual(summary, { reportId: 'report-new', verified: 0, regressed: 0, skipped: 0 });
    const load = recorder.recorded.find((entry) => isFixProposedLoad(entry.sql));
    assert.ok(load, 'the fix-proposed load was issued');
    assert.match(load.sql, /WHERE status = \$1/);
  });

  test('should_count_verified_and_regressed_independently_in_one_run', async () => {
    const recorder = makeRecorder((sql, values) => {
      if (isInspectionSelect(sql)) {
        // only the 'cell-present' anomaly persists in the latest report.
        return [
          makeInspectionReportRow(
            [makeInspectionFinding({ cellId: 'cell-present', anomalyClass: 'fatal' })],
            { report_id: 'report-new' },
          ),
        ];
      }
      if (isFixProposedLoad(sql)) {
        return [
          makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: 'fix-proposed', cell_id: 'cell-gone', anomaly_class: 'fatal' }),
          makeHandoffRow({ handoff_id: 'report-old#1', report_id: 'report-old', status: 'fix-proposed', cell_id: 'cell-present', anomaly_class: 'fatal' }),
        ];
      }
      if (isHandoffByIdLoad(sql)) {
        return [makeHandoffRow({ handoff_id: values[0], report_id: 'report-old', status: 'fix-proposed' })];
      }
      if (isHandoffUpdate(sql)) {
        return [makeHandoffRow({ handoff_id: values[0], report_id: 'report-old', status: values[1] })];
      }
      return [];
    });
    const summary = await verifyFixProposedHandoffs(recorder.database);
    // cell-gone → resolved (verified); cell-present → claimed (regressed).
    assert.deepEqual(summary, { reportId: 'report-new', verified: 1, regressed: 1, skipped: 0 });
  });

  test('should_catch_a_concurrent_advance_exclude_it_and_finish_the_rest', async () => {
    // why (AC #9, load-bearing): a racing transition advances report-old#0 out of
    // fix-proposed between this run's load and its guarded UPDATE, so the UPDATE
    // matches 0 rows and the re-read sees a moved status → applyHandoffTransition
    // THROWS HandoffTransitionError. The verify loop catches it, counts it in NO
    // bucket, and finishes report-old#1 — no double-act, no lost update, no throw.
    let racedLoadCount = 0;
    const recorder = makeRecorder((sql, values) => {
      if (isInspectionSelect(sql)) {
        return [makeInspectionReportRow([], { report_id: 'report-new' })];
      }
      if (isFixProposedLoad(sql)) {
        return [
          makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: 'fix-proposed', cell_id: 'cell-0', anomaly_class: 'fatal' }),
          makeHandoffRow({ handoff_id: 'report-old#1', report_id: 'report-old', status: 'fix-proposed', cell_id: 'cell-1', anomaly_class: 'fatal' }),
        ];
      }
      if (isHandoffByIdLoad(sql)) {
        if (values[0] === 'report-old#0') {
          racedLoadCount = racedLoadCount + 1;
          // first load: still fix-proposed (legality passes); re-read after the
          // 0-row guarded UPDATE: a racing writer already moved it to resolved.
          return [makeHandoffRow({ handoff_id: 'report-old#0', report_id: 'report-old', status: racedLoadCount === 1 ? 'fix-proposed' : 'resolved' })];
        }
        return [makeHandoffRow({ handoff_id: values[0], report_id: 'report-old', status: 'fix-proposed' })];
      }
      if (isHandoffUpdate(sql)) {
        // report-old#0's guarded UPDATE matches 0 rows (raced); the other succeeds.
        if (values[0] === 'report-old#0') {
          return [];
        }
        return [makeHandoffRow({ handoff_id: values[0], report_id: 'report-old', status: values[1] })];
      }
      return [];
    });
    const summary = await verifyFixProposedHandoffs(recorder.database);
    assert.deepEqual(summary, { reportId: 'report-new', verified: 1, regressed: 0, skipped: 0 });
    // accounting: verified + regressed + skipped (1) < initial fix-proposed count
    // (2); the delta of 1 is exactly the caught concurrent miss, in no counter.
    assert.equal(summary.verified + summary.regressed + summary.skipped, 1);
  });
});
