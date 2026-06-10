import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  useAgentPipeline,
  laneItemCount,
  type PriorityRecommendation,
  type PriorityHorizon,
  type PipelineSweepData,
} from './useAgentPipeline.js';
import type { GovernanceSnapshot } from './useGovernanceSnapshot.js';

/**
 * Build a minimal valid GovernanceSnapshot for test injection. Callers
 * override individual fields via the `overrides` parameter.
 */
function makeSnapshot(overrides: Partial<GovernanceSnapshot> = {}): GovernanceSnapshot {
  return {
    generatedAt: '2026-06-09T12:00:00Z',
    schemaVersion: 2,
    throughput: {
      byWeek: [],
      byMonth: [],
      byQuarter: [],
      inFlight: [],
      blocked: [],
      now: [],
    },
    decisions: [],
    commits: [],
    status: [],
    governanceKpis: {
      wpsDoneThisWeek: 3,
      daysSinceLastDoneFlip: 1,
      openDrafts: 2,
    },
    ...overrides,
  };
}

/**
 * Build a minimal valid `PipelineSweepData` projection for test injection. The
 * default run has a healthy cell count and no anomalies; callers override
 * `latestRun.anomalyCounts`, `cellCount`, `staleStatus`, or the sparkline to
 * exercise specific lane behaviors.
 */
function makeSweepData(overrides: Partial<PipelineSweepData> = {}): PipelineSweepData {
  return {
    latestRun: {
      runId: 'test-sweep-run-01',
      submittedAt: '2026-06-09T06:00:00Z',
      startedAt: '2026-06-09T05:55:00Z',
      cellCount: 100,
      anomalyCounts: {},
    },
    staleStatus: 'fresh',
    totalAnomalySparkline: [],
    ...overrides,
  };
}

const EVALUATOR_PLACEHOLDER =
  'No acquisition-readiness evaluation recorded yet. Run the Evaluator quarterly per code-checks-and-balances.md §7.';

describe('useAgentPipeline', () => {
  describe('architect lane', () => {
    it('should_place_openDrafts_kpi_and_draft_wps_in_backlog', () => {
      const snapshot = makeSnapshot({
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [
            { number: 50, title: 'Zone ops refactor', status: 'Draft' as const, dependencies: [] },
            { number: 51, title: 'Ready WP', status: 'Ready' as const, dependencies: [] },
          ],
          blocked: [],
          now: [],
        },
      });
      const result = useAgentPipeline(snapshot);

      const backlogIds = result.architect.backlog.map((item) => item.id);
      assert.ok(backlogIds.includes('kpi-open-drafts'), 'openDrafts KPI in backlog');
      assert.ok(backlogIds.includes('draft-50'), 'Draft WP in backlog');
      assert.ok(!backlogIds.includes('draft-51'), 'Ready WP excluded from architect backlog');
    });

    it('should_place_SPEC_commits_in_active', () => {
      const snapshot = makeSnapshot({
        commits: [
          { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
          { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
          { sha: 'ccc333', kind: 'SPEC', title: 'SPEC: draft WP-101' },
        ],
      });
      const result = useAgentPipeline(snapshot);

      const activeIds = result.architect.active.map((item) => item.id);
      assert.ok(activeIds.includes('aaa111'), 'first SPEC commit in active');
      assert.ok(activeIds.includes('ccc333'), 'second SPEC commit in active');
      assert.ok(!activeIds.includes('bbb222'), 'WP commit excluded from architect active');
    });

    it('should_place_decisions_in_history', () => {
      const snapshot = makeSnapshot({
        decisions: [
          {
            id: 'D-10001',
            title: 'Lock zone ops',
            body: 'Zones store CardExtId only.',
            mtime: '2026-06-08',
          },
          {
            id: 'D-10002',
            title: 'No reduce in effects',
            body: 'Use for...of loops.',
            mtime: '2026-06-07',
          },
        ],
      });
      const result = useAgentPipeline(snapshot);

      const historyIds = result.architect.history.map((item) => item.id);
      assert.ok(historyIds.includes('D-10001'), 'first decision in history');
      assert.ok(historyIds.includes('D-10002'), 'second decision in history');
      assert.equal(result.architect.history[0]!.meta, 'Decision');
    });
  });

  describe('builder lane', () => {
    it('should_place_nextExecutable_wps_in_backlog', () => {
      const snapshot = makeSnapshot({
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [],
          blocked: [],
          now: [{ number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] }],
        },
      });
      const result = useAgentPipeline(snapshot);

      const backlogIds = result.builder.backlog.map((item) => item.id);
      assert.ok(backlogIds.includes('next-70'), 'nextExecutable WP in builder backlog');
      assert.equal(result.builder.backlog[0]!.meta, 'Ready');
    });

    it('should_place_kpi_and_inFlight_in_active', () => {
      const snapshot = makeSnapshot({
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [
            { number: 50, title: 'Zone ops refactor', status: 'Draft' as const, dependencies: [] },
          ],
          blocked: [],
          now: [],
        },
      });
      const result = useAgentPipeline(snapshot);

      const activeIds = result.builder.active.map((item) => item.id);
      assert.ok(activeIds.includes('kpi-wps-done-this-week'), 'wpsDoneThisWeek KPI in active');
      assert.ok(activeIds.includes('in-flight-50'), 'inFlight WP in active');
    });

    it('should_place_WP_commits_and_status_entries_in_history', () => {
      const snapshot = makeSnapshot({
        commits: [
          { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
          { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
        ],
        status: [
          {
            wpNumber: 100,
            ecNumber: '100',
            title: 'Build zone ops',
            date: '2026-06-08',
            body: 'Done.',
            filePath: '',
          },
        ],
      });
      const result = useAgentPipeline(snapshot);

      const historyIds = result.builder.history.map((item) => item.id);
      assert.ok(historyIds.includes('bbb222'), 'WP commit in builder history');
      assert.ok(!historyIds.includes('aaa111'), 'SPEC commit excluded from builder history');
      assert.ok(historyIds.includes('status-100-100'), 'STATUS entry in builder history');
    });
  });

  describe('inspector lane', () => {
    it('should_place_blocked_wps_in_backlog_and_nextExecutable_in_active', () => {
      const snapshot = makeSnapshot({
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [],
          blocked: [
            {
              number: 60,
              title: 'Auth middleware',
              status: 'Blocked' as const,
              dependencies: [59],
            },
          ],
          now: [{ number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] }],
        },
      });
      const result = useAgentPipeline(snapshot);

      const backlogIds = result.inspector.backlog.map((item) => item.id);
      assert.ok(backlogIds.includes('blocked-60'), 'blocked WP in inspector backlog');

      const activeIds = result.inspector.active.map((item) => item.id);
      assert.ok(activeIds.includes('review-70'), 'nextExecutable WP in inspector active');
      assert.equal(result.inspector.active[0]!.meta, 'Awaiting review');
    });

    it('should_place_status_entries_in_history', () => {
      const snapshot = makeSnapshot({
        status: [
          {
            wpNumber: 100,
            ecNumber: '100',
            title: 'Build zone ops',
            date: '2026-06-08',
            body: 'Done.',
            filePath: '',
          },
        ],
      });
      const result = useAgentPipeline(snapshot);

      const historyIds = result.inspector.history.map((item) => item.id);
      assert.ok(historyIds.includes('inspection-100-100'), 'STATUS entry in inspector history');
    });
  });

  describe('evaluator lane', () => {
    it('should_place_daysSinceLastDoneFlip_kpi_in_backlog_and_placeholder_in_active', () => {
      const snapshot = makeSnapshot();
      const result = useAgentPipeline(snapshot);

      assert.equal(result.evaluator.backlog.length, 1);
      assert.equal(result.evaluator.backlog[0]!.id, 'kpi-days-since-done');
      assert.equal(result.evaluator.backlog[0]!.meta, 'KPI');

      assert.equal(result.evaluator.active.length, 1);
      assert.equal(result.evaluator.active[0]!.label, EVALUATOR_PLACEHOLDER);

      assert.equal(result.evaluator.history.length, 0);
    });
  });

  describe('cross-cutting', () => {
    it('should_suppress_all_lane_sections_when_snapshot_has_loadError', () => {
      const snapshot = makeSnapshot({
        error: 'Snapshot generation failed: file not found.',
        commits: [{ sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' }],
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [
            { number: 50, title: 'Zone ops refactor', status: 'Draft' as const, dependencies: [] },
          ],
          blocked: [],
          now: [{ number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] }],
        },
      });
      const result = useAgentPipeline(snapshot);

      assert.equal(laneItemCount(result.architect), 0, 'architect lane suppressed on loadError');
      assert.equal(laneItemCount(result.builder), 0, 'builder lane suppressed on loadError');
      assert.equal(laneItemCount(result.inspector), 0, 'inspector lane suppressed on loadError');
      assert.equal(laneItemCount(result.evaluator), 0, 'evaluator lane suppressed on loadError');
    });

    it('should_omit_kpi_items_without_fabrication_when_governanceKpis_returns_null', () => {
      const snapshot: GovernanceSnapshot = {
        generatedAt: '2026-06-09T12:00:00Z',
        schemaVersion: 2,
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [],
          blocked: [],
          now: [],
        },
        decisions: [],
        commits: [
          { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
          { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
        ],
        status: [],
      };
      const result = useAgentPipeline(snapshot);

      const architectBacklogIds = result.architect.backlog.map((item) => item.id);
      assert.ok(
        !architectBacklogIds.includes('kpi-open-drafts'),
        'no openDrafts KPI when kpis null',
      );

      const builderActiveIds = result.builder.active.map((item) => item.id);
      assert.ok(
        !builderActiveIds.includes('kpi-wps-done-this-week'),
        'no wpsDoneThisWeek KPI when kpis null',
      );

      assert.equal(
        result.evaluator.backlog.length,
        0,
        'no daysSinceLastDoneFlip KPI when kpis null',
      );
    });

    it('should_produce_items_conforming_to_PipelineItem_shape', () => {
      const snapshot = makeSnapshot({
        commits: [
          { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
          { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
        ],
        decisions: [
          { id: 'D-10001', title: 'Lock zone ops', body: 'Detail.', mtime: '2026-06-08' },
        ],
        status: [
          {
            wpNumber: 100,
            ecNumber: '100',
            title: 'Build',
            date: '2026-06-08',
            body: 'Done.',
            filePath: '',
          },
        ],
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [
            { number: 50, title: 'Zone ops refactor', status: 'Draft' as const, dependencies: [] },
          ],
          blocked: [
            {
              number: 60,
              title: 'Auth middleware',
              status: 'Blocked' as const,
              dependencies: [59],
            },
          ],
          now: [{ number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] }],
        },
      });
      const result = useAgentPipeline(snapshot);

      const allItems = [
        ...result.architect.backlog,
        ...result.architect.active,
        ...result.architect.history,
        ...result.builder.backlog,
        ...result.builder.active,
        ...result.builder.history,
        ...result.inspector.backlog,
        ...result.inspector.active,
        ...result.inspector.history,
        ...result.evaluator.backlog,
        ...result.evaluator.active,
        ...result.evaluator.history,
      ];

      for (const item of allItems) {
        assert.equal(typeof item.id, 'string', `item "${item.label}" has string id`);
        assert.ok(item.id.length > 0, `item "${item.label}" has non-empty id`);
        assert.equal(typeof item.label, 'string', `item "${item.id}" has string label`);
        assert.ok(item.label.length > 0, `item "${item.id}" has non-empty label`);
        if (item.meta !== undefined) {
          assert.equal(typeof item.meta, 'string', `item "${item.id}" meta is string when present`);
        }
      }
    });

    it('should_return_laneItemCount_zero_for_empty_lanes', () => {
      const snapshot: GovernanceSnapshot = {
        generatedAt: '2026-06-09T12:00:00Z',
        schemaVersion: 2,
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [],
          blocked: [],
          now: [],
        },
        decisions: [],
        commits: [],
        status: [],
      };
      const result = useAgentPipeline(snapshot);

      assert.equal(laneItemCount(result.architect), 0);
      assert.equal(laneItemCount(result.builder), 0);
      assert.equal(laneItemCount(result.inspector), 0);
    });

    it('should_prevent_cross_lane_commit_leakage_when_mixed_commit_kinds_present', () => {
      const snapshot = makeSnapshot({
        commits: [
          { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
          { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
          { sha: 'ccc333', kind: 'SPEC', title: 'SPEC: draft WP-101' },
          { sha: 'ddd444', kind: 'WP', title: 'EC-101: implement next' },
        ],
      });
      const result = useAgentPipeline(snapshot);

      const architectCommitIds = result.architect.active
        .filter((item) => item.meta === 'SPEC')
        .map((item) => item.id);
      const builderCommitIds = result.builder.history
        .filter((item) => item.meta === 'WP')
        .map((item) => item.id);

      for (const architectId of architectCommitIds) {
        assert.ok(
          !builderCommitIds.includes(architectId),
          `commit ${architectId} must not appear in both architect and builder lanes`,
        );
      }
    });

    it('should_have_non_empty_emptyBacklog_emptyActive_emptyHistory_strings', () => {
      const snapshot = makeSnapshot();
      const result = useAgentPipeline(snapshot);

      for (const lane of [result.architect, result.builder, result.inspector, result.evaluator]) {
        assert.ok(lane.emptyBacklog.length > 0, `${lane.title} has non-empty emptyBacklog`);
        assert.ok(lane.emptyActive.length > 0, `${lane.title} has non-empty emptyActive`);
        assert.ok(lane.emptyHistory.length > 0, `${lane.title} has non-empty emptyHistory`);
      }
    });
  });

  describe('priority recommendations', () => {
    const VALID_HORIZONS: readonly PriorityHorizon[] = [
      'today',
      'this-week',
      'this-month',
      'this-quarter',
    ];
    const VALID_URGENCIES = ['critical', 'high', 'moderate', 'strategic'];

    it('should_produce_exactly_four_priorities_per_lane_with_valid_horizons_and_urgencies', () => {
      const snapshot = makeSnapshot();
      const result = useAgentPipeline(snapshot);

      for (const lane of [result.architect, result.builder, result.inspector, result.evaluator]) {
        assert.equal(lane.priorities.length, 4, `${lane.title} has 4 priorities`);

        const horizons = lane.priorities.map(
          (priority: PriorityRecommendation) => priority.horizon,
        );
        for (const expectedHorizon of VALID_HORIZONS) {
          assert.ok(
            horizons.includes(expectedHorizon),
            `${lane.title} has ${expectedHorizon} horizon`,
          );
        }

        for (const priority of lane.priorities) {
          assert.ok(
            VALID_URGENCIES.includes(priority.urgency),
            `${lane.title} ${priority.horizon} has valid urgency "${priority.urgency}"`,
          );
          assert.ok(
            priority.label.length > 0,
            `${lane.title} ${priority.horizon} has non-empty label`,
          );
        }
      }
    });

    it('should_return_empty_priorities_when_snapshot_has_loadError', () => {
      const snapshot = makeSnapshot({ error: 'Snapshot generation failed.' });
      const result = useAgentPipeline(snapshot);

      for (const lane of [result.architect, result.builder, result.inspector, result.evaluator]) {
        assert.equal(lane.priorities.length, 0, `${lane.title} has no priorities on loadError`);
      }
    });

    it('should_escalate_architect_urgency_when_many_drafts_are_open', () => {
      const snapshot = makeSnapshot({
        governanceKpis: { openDrafts: 5, wpsDoneThisWeek: 2, daysSinceLastDoneFlip: 1 },
      });
      const result = useAgentPipeline(snapshot);

      const todayPriority = result.architect.priorities.find(
        (priority: PriorityRecommendation) => priority.horizon === 'today',
      );
      assert.equal(
        todayPriority!.urgency,
        'critical',
        'architect today is critical with 5 open drafts',
      );
    });

    it('should_flag_builder_critical_when_zero_wps_done_this_week', () => {
      const snapshot = makeSnapshot({
        governanceKpis: { openDrafts: 0, wpsDoneThisWeek: 0, daysSinceLastDoneFlip: 1 },
      });
      const result = useAgentPipeline(snapshot);

      const weekPriority = result.builder.priorities.find(
        (priority: PriorityRecommendation) => priority.horizon === 'this-week',
      );
      assert.equal(
        weekPriority!.urgency,
        'critical',
        'builder this-week is critical with 0 WPs done',
      );
    });

    it('should_flag_inspector_critical_when_multiple_wps_blocked', () => {
      const snapshot = makeSnapshot({
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [],
          blocked: [
            {
              number: 60,
              title: 'Auth middleware',
              status: 'Blocked' as const,
              dependencies: [59],
            },
            { number: 61, title: 'Session tokens', status: 'Blocked' as const, dependencies: [60] },
          ],
          now: [],
        },
      });
      const result = useAgentPipeline(snapshot);

      const todayPriority = result.inspector.priorities.find(
        (priority: PriorityRecommendation) => priority.horizon === 'today',
      );
      assert.equal(
        todayPriority!.urgency,
        'critical',
        'inspector today is critical with 2 blocked',
      );
    });

    it('should_flag_evaluator_critical_when_days_since_last_completion_exceeds_seven', () => {
      const snapshot = makeSnapshot({
        governanceKpis: { openDrafts: 0, wpsDoneThisWeek: 0, daysSinceLastDoneFlip: 10 },
      });
      const result = useAgentPipeline(snapshot);

      const todayPriority = result.evaluator.priorities.find(
        (priority: PriorityRecommendation) => priority.horizon === 'today',
      );
      assert.equal(
        todayPriority!.urgency,
        'critical',
        'evaluator today is critical at 10 days stale',
      );
    });

    it('should_produce_strategic_urgency_when_all_signals_are_healthy', () => {
      const snapshot = makeSnapshot({
        governanceKpis: { openDrafts: 0, wpsDoneThisWeek: 5, daysSinceLastDoneFlip: 1 },
        commits: [
          { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
          { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
        ],
      });
      const result = useAgentPipeline(snapshot);

      const architectToday = result.architect.priorities.find(
        (priority: PriorityRecommendation) => priority.horizon === 'today',
      );
      assert.equal(
        architectToday!.urgency,
        'strategic',
        'architect today is strategic when no drafts',
      );

      const builderWeek = result.builder.priorities.find(
        (priority: PriorityRecommendation) => priority.horizon === 'this-week',
      );
      assert.equal(
        builderWeek!.urgency,
        'strategic',
        'builder this-week is strategic at 5 WPs done',
      );
    });
  });

  describe('sweep integration (WP-230)', () => {
    it('should_add_inspector_backlog_items_for_each_anomaly_with_count_above_zero', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'soft-stall': 3, 'render-glitch': 2, 'never-happens': 0 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const sweepItems = result.inspector.backlog.filter((item) =>
        item.id.startsWith('sweep-inspector-'),
      );
      assert.equal(
        sweepItems.length,
        2,
        'one item per anomaly key with count > 0; zero-count key excluded',
      );
      for (const item of sweepItems) {
        assert.equal(item.meta, 'Sweep', 'sweep-derived item carries the Sweep meta tag');
        assert.ok(
          / anomaly\(s\) — triage$/.test(item.label),
          `label is the triage format: "${item.label}"`,
        );
      }
    });

    it('should_add_builder_backlog_items_only_for_fatal_class_anomalies', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'engine-fatal': 4, 'soft-stall': 7 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const builderSweepIds = result.builder.backlog
        .filter((item) => item.id.startsWith('sweep-builder-'))
        .map((item) => item.id);
      assert.deepEqual(
        builderSweepIds,
        ['sweep-builder-engine-fatal'],
        'only the fatal-class key yields a builder item',
      );

      const fatalItem = result.builder.backlog.find(
        (item) => item.id === 'sweep-builder-engine-fatal',
      );
      assert.equal(fatalItem!.meta, 'Sweep');
      assert.equal(fatalItem!.label, '4 fatal crash(es) — investigate error signatures');
    });

    it('should_add_architect_health_item_when_health_rate_below_threshold', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'soft-stall': 20, 'render-glitch': 10 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const healthItem = result.architect.backlog.find(
        (item) => item.id === 'sweep-architect-health',
      );
      assert.ok(healthItem, 'architect health item present when health rate < 0.8');
      assert.equal(healthItem!.meta, 'Sweep');
      assert.equal(healthItem!.label, '70% sweep health rate — review spec coverage');
    });

    it('should_not_add_architect_health_item_when_health_rate_at_or_above_threshold', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'soft-stall': 10 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const healthItem = result.architect.backlog.find(
        (item) => item.id === 'sweep-architect-health',
      );
      assert.equal(healthItem, undefined, 'no health item when rate is 0.9 (>= 0.8)');
    });

    it('should_replace_evaluator_placeholder_with_freshness_item_when_sweep_data_present', () => {
      const sweepData = makeSweepData({
        staleStatus: 'fresh',
        totalAnomalySparkline: [2, 4, 6],
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const activeIds = result.evaluator.active.map((item) => item.id);
      assert.ok(
        !activeIds.includes('evaluator-placeholder'),
        'static placeholder replaced when sweep data present',
      );
      const freshnessItem = result.evaluator.active.find(
        (item) => item.id === 'sweep-evaluator-freshness',
      );
      assert.ok(freshnessItem, 'sweep freshness item present');
      assert.equal(freshnessItem!.meta, 'Sweep');
      assert.equal(freshnessItem!.label, 'Nightly sweep is fresh — anomaly trend improving');
    });

    it('should_keep_evaluator_placeholder_when_sweep_latestRun_is_null', () => {
      const sweepData = makeSweepData({ latestRun: null });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      assert.equal(result.evaluator.active.length, 1);
      assert.equal(result.evaluator.active[0]!.id, 'evaluator-placeholder');
      assert.equal(result.evaluator.active[0]!.label, EVALUATOR_PLACEHOLDER);
    });

    it('should_produce_no_sweep_items_when_sweepData_is_undefined', () => {
      const result = useAgentPipeline(makeSnapshot());

      const allItems = [
        ...result.architect.backlog,
        ...result.architect.active,
        ...result.architect.history,
        ...result.builder.backlog,
        ...result.builder.active,
        ...result.builder.history,
        ...result.inspector.backlog,
        ...result.inspector.active,
        ...result.inspector.history,
        ...result.evaluator.backlog,
        ...result.evaluator.active,
        ...result.evaluator.history,
      ];
      const sweepItems = allItems.filter((item) => item.id.startsWith('sweep-'));
      assert.equal(sweepItems.length, 0, 'no sweep-prefixed items when no sweep data is injected');
      assert.equal(result.evaluator.active[0]!.id, 'evaluator-placeholder', 'placeholder retained');
    });

    it('should_produce_no_sweep_items_when_latestRun_is_null', () => {
      const sweepData = makeSweepData({ latestRun: null });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const backlogSweepItems = [
        ...result.architect.backlog,
        ...result.builder.backlog,
        ...result.inspector.backlog,
      ].filter((item) => item.id.startsWith('sweep-'));
      assert.equal(backlogSweepItems.length, 0, 'no sweep backlog items when latestRun is null');
    });

    it('should_escalate_inspector_and_builder_today_to_critical_when_fatals_present', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'engine-fatal': 2 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const inspectorToday = result.inspector.priorities.find(
        (priority) => priority.horizon === 'today',
      );
      const builderToday = result.builder.priorities.find(
        (priority) => priority.horizon === 'today',
      );
      assert.equal(
        inspectorToday!.urgency,
        'critical',
        'inspector today escalates to critical on fatals',
      );
      assert.equal(
        builderToday!.urgency,
        'critical',
        'builder today escalates to critical on fatals',
      );
    });

    it('should_escalate_evaluator_today_to_high_when_sweep_is_stale', () => {
      const sweepData = makeSweepData({ staleStatus: 'stale' });
      const snapshot = makeSnapshot({
        governanceKpis: { openDrafts: 0, wpsDoneThisWeek: 5, daysSinceLastDoneFlip: 1 },
      });
      const result = useAgentPipeline(snapshot, sweepData);

      const evaluatorToday = result.evaluator.priorities.find(
        (priority) => priority.horizon === 'today',
      );
      assert.equal(
        evaluatorToday!.urgency,
        'high',
        'evaluator today escalates to high on stale sweep',
      );
    });

    it('should_escalate_architect_this_week_to_high_when_health_rate_below_threshold', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'soft-stall': 40 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const architectWeek = result.architect.priorities.find(
        (priority) => priority.horizon === 'this-week',
      );
      assert.equal(
        architectWeek!.urgency,
        'high',
        'architect this-week escalates to high on low health rate',
      );
    });

    it('should_sort_fatal_class_anomalies_before_non_fatal_in_inspector_backlog', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          // Authored non-fatal-first and alphabetically ascending so a passing
          // assertion can only come from the fatal-first sort, not source order.
          anomalyCounts: { 'aaa-stall': 1, 'zzz-fatal': 1 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const sweepIds = result.inspector.backlog
        .filter((item) => item.id.startsWith('sweep-inspector-'))
        .map((item) => item.id);
      const fatalIndex = sweepIds.indexOf('sweep-inspector-zzz-fatal');
      const nonFatalIndex = sweepIds.indexOf('sweep-inspector-aaa-stall');
      assert.ok(fatalIndex >= 0 && nonFatalIndex >= 0, 'both anomaly items present');
      assert.ok(fatalIndex < nonFatalIndex, 'fatal-class anomaly sorts before non-fatal');
    });

    it('should_treat_anomaly_keys_opaquely_for_arbitrary_unknown_keys', () => {
      // Keys here are invented strings outside any engine taxonomy; the
      // composable must surface them dynamically without hardcoding key names.
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'totally-made-up-key': 5 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const item = result.inspector.backlog.find(
        (entry) => entry.id === 'sweep-inspector-totally-made-up-key',
      );
      assert.ok(item, 'arbitrary opaque key surfaces as an inspector item');
      assert.equal(item!.label, '5 totally-made-up-key anomaly(s) — triage');
    });

    it('should_retain_existing_kpi_items_when_sweep_data_present_backward_compatible', () => {
      const sweepData = makeSweepData({
        latestRun: {
          runId: 'r1',
          submittedAt: '2026-06-09T06:00:00Z',
          startedAt: '2026-06-09T05:55:00Z',
          cellCount: 100,
          anomalyCounts: { 'soft-stall': 30 },
        },
      });
      const result = useAgentPipeline(makeSnapshot(), sweepData);

      const architectBacklogIds = result.architect.backlog.map((item) => item.id);
      assert.ok(
        architectBacklogIds.includes('kpi-open-drafts'),
        'existing KPI item retained alongside sweep item',
      );

      const builderActiveIds = result.builder.active.map((item) => item.id);
      assert.ok(
        builderActiveIds.includes('kpi-wps-done-this-week'),
        'existing builder KPI item retained',
      );
    });
  });
});
