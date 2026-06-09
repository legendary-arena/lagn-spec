import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useAgentPipeline, type PipelineItem } from './useAgentPipeline.js';
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
  it('should_include_openDrafts_kpi_and_SPEC_commits_when_architect_lane_derived', () => {
    const snapshot = makeSnapshot({
      commits: [
        { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
        { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
        { sha: 'ccc333', kind: 'SPEC', title: 'SPEC: draft WP-101' },
      ],
    });
    const result = useAgentPipeline(snapshot);

    const ids = result.architect.items.map((item) => item.id);
    assert.ok(ids.includes('kpi-open-drafts'), 'openDrafts KPI item is present');
    assert.ok(ids.includes('aaa111'), 'first SPEC commit is present');
    assert.ok(ids.includes('ccc333'), 'second SPEC commit is present');
    assert.ok(!ids.includes('bbb222'), 'WP commit is excluded from architect lane');
    assert.equal(result.architect.title, 'Architect');
  });

  it('should_include_wpsDoneThisWeek_kpi_and_inFlight_and_WP_commits_when_builder_lane_derived', () => {
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
      commits: [
        { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
        { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
      ],
    });
    const result = useAgentPipeline(snapshot);

    const ids = result.builder.items.map((item) => item.id);
    assert.ok(ids.includes('kpi-wps-done-this-week'), 'wpsDoneThisWeek KPI item is present');
    assert.ok(ids.includes('in-flight-50'), 'inFlight WP is present');
    assert.ok(ids.includes('bbb222'), 'WP commit is present');
    assert.ok(!ids.includes('aaa111'), 'SPEC commit is excluded from builder lane');
    assert.equal(result.builder.title, 'Builder');
  });

  it('should_compose_nextExecutable_and_blocked_when_inspector_lane_derived', () => {
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
          { number: 71, title: 'KPI strip', status: 'Ready' as const, dependencies: [] },
        ],
      },
    });
    const result = useAgentPipeline(snapshot);

    const ids = result.inspector.items.map((item) => item.id);
    assert.ok(ids.includes('next-70'), 'first nextExecutable WP is present');
    assert.ok(ids.includes('next-71'), 'second nextExecutable WP is present');
    assert.ok(ids.includes('blocked-60'), 'blocked WP is present');
    assert.equal(result.inspector.title, 'Inspector');
  });

  it('should_return_exactly_one_item_with_locked_placeholder_when_evaluator_lane_derived', () => {
    const snapshot = makeSnapshot();
    const result = useAgentPipeline(snapshot);

    assert.equal(result.evaluator.items.length, 1, 'evaluator has exactly one item');
    assert.equal(result.evaluator.items[0]!.label, EVALUATOR_PLACEHOLDER);
    assert.equal(result.evaluator.items[0]!.id, 'evaluator-placeholder');
    assert.equal(result.evaluator.title, 'Evaluator');
  });

  it('should_suppress_all_lane_items_when_snapshot_has_loadError', () => {
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

    assert.equal(result.architect.items.length, 0, 'architect lane suppressed on loadError');
    assert.equal(result.builder.items.length, 0, 'builder lane suppressed on loadError');
    assert.equal(result.inspector.items.length, 0, 'inspector lane suppressed on loadError');
    assert.equal(result.evaluator.items.length, 0, 'evaluator lane suppressed on loadError');
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

    const architectIds = result.architect.items.map((item) => item.id);
    assert.ok(!architectIds.includes('kpi-open-drafts'), 'no openDrafts KPI when kpis null');
    assert.ok(architectIds.includes('aaa111'), 'SPEC commits still present');

    const builderIds = result.builder.items.map((item) => item.id);
    assert.ok(!builderIds.includes('kpi-wps-done-this-week'), 'no wpsDoneThisWeek KPI when kpis null');
    assert.ok(builderIds.includes('bbb222'), 'WP commits still present');
  });

  it('should_conform_to_PipelineItem_shape_when_items_inspected', () => {
    const snapshot = makeSnapshot({
      commits: [
        { sha: 'aaa111', kind: 'SPEC', title: 'SPEC: draft WP-100' },
        { sha: 'bbb222', kind: 'WP', title: 'EC-100: implement feature' },
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

    const allItems: readonly PipelineItem[] = [
      ...result.architect.items,
      ...result.builder.items,
      ...result.inspector.items,
      ...result.evaluator.items,
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

  it('should_show_emptyMessage_when_lane_has_no_items_and_kpis_null', () => {
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

    assert.equal(result.architect.items.length, 0);
    assert.equal(typeof result.architect.emptyMessage, 'string');
    assert.ok(result.architect.emptyMessage.length > 0);

    assert.equal(result.builder.items.length, 0);
    assert.equal(typeof result.builder.emptyMessage, 'string');
    assert.ok(result.builder.emptyMessage.length > 0);

    assert.equal(result.inspector.items.length, 0);
    assert.equal(typeof result.inspector.emptyMessage, 'string');
    assert.ok(result.inspector.emptyMessage.length > 0);

    assert.equal(result.evaluator.items.length, 1, 'evaluator always has one item even when data is sparse');
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

    const architectCommitIds = result.architect.items
      .filter((item) => item.meta === 'SPEC')
      .map((item) => item.id);
    const builderCommitIds = result.builder.items
      .filter((item) => item.meta === 'WP')
      .map((item) => item.id);

    for (const architectId of architectCommitIds) {
      assert.ok(
        !builderCommitIds.includes(architectId),
        `commit ${architectId} must not appear in both architect and builder lanes`,
      );
    }
  });
});
