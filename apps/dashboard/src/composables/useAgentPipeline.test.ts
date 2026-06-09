import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useAgentPipeline, laneItemCount } from './useAgentPipeline.js';
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
          { id: 'D-10001', title: 'Lock zone ops', body: 'Zones store CardExtId only.', mtime: '2026-06-08' },
          { id: 'D-10002', title: 'No reduce in effects', body: 'Use for...of loops.', mtime: '2026-06-07' },
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
          now: [
            { number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] },
          ],
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
          { wpNumber: 100, ecNumber: '100', title: 'Build zone ops', date: '2026-06-08', body: 'Done.', filePath: '' },
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
            { number: 60, title: 'Auth middleware', status: 'Blocked' as const, dependencies: [59] },
          ],
          now: [
            { number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] },
          ],
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
          { wpNumber: 100, ecNumber: '100', title: 'Build zone ops', date: '2026-06-08', body: 'Done.', filePath: '' },
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
        commits: [
          { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
        ],
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [
            { number: 50, title: 'Zone ops refactor', status: 'Draft' as const, dependencies: [] },
          ],
          blocked: [],
          now: [
            { number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] },
          ],
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
      assert.ok(!architectBacklogIds.includes('kpi-open-drafts'), 'no openDrafts KPI when kpis null');

      const builderActiveIds = result.builder.active.map((item) => item.id);
      assert.ok(!builderActiveIds.includes('kpi-wps-done-this-week'), 'no wpsDoneThisWeek KPI when kpis null');

      assert.equal(result.evaluator.backlog.length, 0, 'no daysSinceLastDoneFlip KPI when kpis null');
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
          { wpNumber: 100, ecNumber: '100', title: 'Build', date: '2026-06-08', body: 'Done.', filePath: '' },
        ],
        throughput: {
          byWeek: [],
          byMonth: [],
          byQuarter: [],
          inFlight: [
            { number: 50, title: 'Zone ops refactor', status: 'Draft' as const, dependencies: [] },
          ],
          blocked: [
            { number: 60, title: 'Auth middleware', status: 'Blocked' as const, dependencies: [59] },
          ],
          now: [
            { number: 70, title: 'Pipeline page', status: 'Ready' as const, dependencies: [] },
          ],
        },
      });
      const result = useAgentPipeline(snapshot);

      const allItems = [
        ...result.architect.backlog, ...result.architect.active, ...result.architect.history,
        ...result.builder.backlog, ...result.builder.active, ...result.builder.history,
        ...result.inspector.backlog, ...result.inspector.active, ...result.inspector.history,
        ...result.evaluator.backlog, ...result.evaluator.active, ...result.evaluator.history,
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
});
