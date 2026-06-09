import {
  useGovernanceSnapshot,
  type GovernanceSnapshot,
} from './useGovernanceSnapshot.js';

/**
 * A single item rendered in one of the four pipeline lanes.
 */
export interface PipelineItem {
  readonly id: string;
  readonly label: string;
  readonly meta?: string;
}

/**
 * A single pipeline lane: title, items, and a fallback message when the lane
 * has no items to display.
 */
export interface PipelineLane {
  readonly title: string;
  readonly items: readonly PipelineItem[];
  readonly emptyMessage: string;
}

/**
 * Return value of `useAgentPipeline` — one lane per checks-and-balances role.
 */
export interface UseAgentPipelineReturn {
  readonly architect: PipelineLane;
  readonly builder: PipelineLane;
  readonly inspector: PipelineLane;
  readonly evaluator: PipelineLane;
}

const EVALUATOR_PLACEHOLDER =
  'No acquisition-readiness evaluation recorded yet. Run the Evaluator quarterly per code-checks-and-balances.md §7.';

/**
 * Derives the four-lane Architect → Builder → Inspector → Evaluator pipeline
 * view-model from the build-time governance snapshot. All lane data flows
 * exclusively through `useGovernanceSnapshot`; this composable introduces no
 * other data source.
 *
 * When the snapshot carries a load error, every lane returns an empty `items`
 * array so the page can render a unified error state without lane content.
 */
// why: the composable accepts snapshotOverride and passes it to
// useGovernanceSnapshot so tests can inject deterministic fixtures without
// touching the baked snapshot file (D-22901 snapshot-only posture).
export function useAgentPipeline(
  snapshotOverride?: GovernanceSnapshot,
): UseAgentPipelineReturn {
  const snapshot = useGovernanceSnapshot(snapshotOverride);

  const emptyArchitect: PipelineLane = {
    title: 'Architect',
    items: [],
    emptyMessage: 'No recent architect activity.',
  };
  const emptyBuilder: PipelineLane = {
    title: 'Builder',
    items: [],
    emptyMessage: 'No recent builder activity.',
  };
  const emptyInspector: PipelineLane = {
    title: 'Inspector',
    items: [],
    emptyMessage: 'No executable or blocked work packets.',
  };
  const emptyEvaluator: PipelineLane = {
    title: 'Evaluator',
    items: [],
    emptyMessage: 'No evaluator data.',
  };

  if (snapshot.loadError) {
    return {
      architect: emptyArchitect,
      builder: emptyBuilder,
      inspector: emptyInspector,
      evaluator: emptyEvaluator,
    };
  }

  const recentCommits = snapshot.commits(5);
  const kpis = snapshot.governanceKpis();

  const architectItems: PipelineItem[] = [];
  if (kpis !== null) {
    architectItems.push({
      id: 'kpi-open-drafts',
      label: `${kpis.openDrafts} open draft(s)`,
      meta: 'KPI',
    });
  }
  for (const commit of recentCommits) {
    if (commit.kind === 'SPEC') {
      architectItems.push({
        id: commit.sha,
        label: commit.title,
        meta: 'SPEC',
      });
    }
  }

  const builderItems: PipelineItem[] = [];
  if (kpis !== null) {
    builderItems.push({
      id: 'kpi-wps-done-this-week',
      label: `${kpis.wpsDoneThisWeek} WP(s) done this week`,
      meta: 'KPI',
    });
  }
  for (const wpRef of snapshot.inFlight()) {
    builderItems.push({
      id: `in-flight-${wpRef.number}`,
      label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
      meta: 'In-flight',
    });
  }
  for (const commit of recentCommits) {
    if (commit.kind === 'WP') {
      builderItems.push({
        id: commit.sha,
        label: commit.title,
        meta: 'WP',
      });
    }
  }

  const inspectorItems: PipelineItem[] = [];
  for (const wpRef of snapshot.nextExecutable(5)) {
    inspectorItems.push({
      id: `next-${wpRef.number}`,
      label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
      meta: 'Ready',
    });
  }
  for (const wpRef of snapshot.blocked()) {
    inspectorItems.push({
      id: `blocked-${wpRef.number}`,
      label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
      meta: 'Blocked',
    });
  }

  // why: the Evaluator lane is a static placeholder — no acquisition-readiness
  // data source exists in v1; enrichment is deferred to a follow-up WP per
  // code-checks-and-balances.md §7.
  const evaluatorItems: PipelineItem[] = [
    {
      id: 'evaluator-placeholder',
      label: EVALUATOR_PLACEHOLDER,
    },
  ];

  return {
    architect: {
      title: 'Architect',
      items: architectItems,
      emptyMessage: 'No recent architect activity.',
    },
    builder: {
      title: 'Builder',
      items: builderItems,
      emptyMessage: 'No recent builder activity.',
    },
    inspector: {
      title: 'Inspector',
      items: inspectorItems,
      emptyMessage: 'No executable or blocked work packets.',
    },
    evaluator: {
      title: 'Evaluator',
      items: evaluatorItems,
      emptyMessage: 'No evaluator data.',
    },
  };
}
