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
 * A single pipeline lane with three temporal columns: upcoming work, current
 * status, and past activity. Each column carries its own items array and
 * empty-state fallback message.
 */
export interface PipelineLane {
  readonly title: string;
  readonly backlog: readonly PipelineItem[];
  readonly active: readonly PipelineItem[];
  readonly history: readonly PipelineItem[];
  readonly emptyBacklog: string;
  readonly emptyActive: string;
  readonly emptyHistory: string;
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

/**
 * Total item count across all three temporal columns of a lane.
 */
export function laneItemCount(lane: PipelineLane): number {
  return lane.backlog.length + lane.active.length + lane.history.length;
}

const EVALUATOR_PLACEHOLDER =
  'No acquisition-readiness evaluation recorded yet. Run the Evaluator quarterly per code-checks-and-balances.md §7.';

/**
 * Derives the four-lane Architect → Builder → Inspector → Evaluator pipeline
 * view-model from the build-time governance snapshot. Each lane exposes three
 * temporal columns — backlog (upcoming work), active (current status), and
 * history (past activity) — so the Pipeline page renders a forward-and-backward
 * view of play.legendary-arena.com development.
 *
 * All lane data flows exclusively through `useGovernanceSnapshot`; this
 * composable introduces no other data source.
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
    backlog: [],
    active: [],
    history: [],
    emptyBacklog: 'No draft WPs needing specs.',
    emptyActive: 'No recent spec activity.',
    emptyHistory: 'No recent decisions.',
  };
  const emptyBuilder: PipelineLane = {
    title: 'Builder',
    backlog: [],
    active: [],
    history: [],
    emptyBacklog: 'No WPs ready to build.',
    emptyActive: 'No builds in progress.',
    emptyHistory: 'No recent build activity.',
  };
  const emptyInspector: PipelineLane = {
    title: 'Inspector',
    backlog: [],
    active: [],
    history: [],
    emptyBacklog: 'No blocked work packets.',
    emptyActive: 'No WPs awaiting review.',
    emptyHistory: 'No recent inspections.',
  };
  const emptyEvaluator: PipelineLane = {
    title: 'Evaluator',
    backlog: [],
    active: [],
    history: [],
    emptyBacklog: 'Run /agent-evaluator quarterly.',
    emptyActive: 'No evaluation in progress.',
    emptyHistory: 'No evaluation reports yet.',
  };

  if (snapshot.loadError) {
    return {
      architect: emptyArchitect,
      builder: emptyBuilder,
      inspector: emptyInspector,
      evaluator: emptyEvaluator,
    };
  }

  const recentCommits = snapshot.commits(10);
  const kpis = snapshot.governanceKpis();
  const recentDecisions = snapshot.decisions(5);
  const recentStatusEntries = snapshot.statusEntries(5);

  // --- Architect lane: specs and planning ---
  const architectBacklog: PipelineItem[] = [];
  if (kpis !== null) {
    architectBacklog.push({
      id: 'kpi-open-drafts',
      label: `${kpis.openDrafts} open draft(s) needing specs`,
      meta: 'KPI',
    });
  }
  for (const wpRef of snapshot.inFlight()) {
    if (wpRef.status === 'Draft') {
      architectBacklog.push({
        id: `draft-${wpRef.number}`,
        label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
        meta: 'Draft',
      });
    }
  }

  const architectActive: PipelineItem[] = [];
  for (const commit of recentCommits) {
    if (commit.kind === 'SPEC') {
      architectActive.push({
        id: commit.sha,
        label: commit.title,
        meta: 'SPEC',
      });
    }
  }

  const architectHistory: PipelineItem[] = [];
  for (const decision of recentDecisions) {
    architectHistory.push({
      id: decision.id,
      label: `${decision.id} — ${decision.title}`,
      meta: 'Decision',
    });
  }

  // --- Builder lane: code implementation ---
  const builderBacklog: PipelineItem[] = [];
  for (const wpRef of snapshot.nextExecutable(5)) {
    builderBacklog.push({
      id: `next-${wpRef.number}`,
      label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
      meta: 'Ready',
    });
  }

  const builderActive: PipelineItem[] = [];
  if (kpis !== null) {
    builderActive.push({
      id: 'kpi-wps-done-this-week',
      label: `${kpis.wpsDoneThisWeek} WP(s) done this week`,
      meta: 'KPI',
    });
  }
  for (const wpRef of snapshot.inFlight()) {
    builderActive.push({
      id: `in-flight-${wpRef.number}`,
      label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
      meta: 'In-flight',
    });
  }

  const builderHistory: PipelineItem[] = [];
  for (const commit of recentCommits) {
    if (commit.kind === 'WP') {
      builderHistory.push({
        id: commit.sha,
        label: commit.title,
        meta: 'WP',
      });
    }
  }
  for (const entry of recentStatusEntries) {
    builderHistory.push({
      id: `status-${entry.wpNumber}-${entry.ecNumber}`,
      label: `WP-${String(entry.wpNumber).padStart(3, '0')} / EC-${entry.ecNumber} — ${entry.title}`,
      meta: entry.date,
    });
  }

  // --- Inspector lane: code review ---
  const inspectorBacklog: PipelineItem[] = [];
  for (const wpRef of snapshot.blocked()) {
    inspectorBacklog.push({
      id: `blocked-${wpRef.number}`,
      label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
      meta: 'Blocked',
    });
  }

  const inspectorActive: PipelineItem[] = [];
  for (const wpRef of snapshot.nextExecutable(5)) {
    inspectorActive.push({
      id: `review-${wpRef.number}`,
      label: `WP-${String(wpRef.number).padStart(3, '0')} — ${wpRef.title}`,
      meta: 'Awaiting review',
    });
  }

  const inspectorHistory: PipelineItem[] = [];
  for (const entry of recentStatusEntries) {
    inspectorHistory.push({
      id: `inspection-${entry.wpNumber}-${entry.ecNumber}`,
      label: `WP-${String(entry.wpNumber).padStart(3, '0')} / EC-${entry.ecNumber} — ${entry.title}`,
      meta: entry.date,
    });
  }

  // --- Evaluator lane: quarterly acquisition-readiness audit ---
  const evaluatorBacklog: PipelineItem[] = [];
  if (kpis !== null) {
    evaluatorBacklog.push({
      id: 'kpi-days-since-done',
      label: `${kpis.daysSinceLastDoneFlip} day(s) since last WP completed`,
      meta: 'KPI',
    });
  }

  // why: the Evaluator active/history columns are static placeholders — no
  // acquisition-readiness data source exists in v1; enrichment is deferred
  // to a follow-up WP per code-checks-and-balances.md §7.
  const evaluatorActive: PipelineItem[] = [
    {
      id: 'evaluator-placeholder',
      label: EVALUATOR_PLACEHOLDER,
    },
  ];

  const evaluatorHistory: PipelineItem[] = [];

  return {
    architect: {
      title: 'Architect',
      backlog: architectBacklog,
      active: architectActive,
      history: architectHistory,
      emptyBacklog: 'No draft WPs needing specs.',
      emptyActive: 'No recent spec activity.',
      emptyHistory: 'No recent decisions.',
    },
    builder: {
      title: 'Builder',
      backlog: builderBacklog,
      active: builderActive,
      history: builderHistory,
      emptyBacklog: 'No WPs ready to build.',
      emptyActive: 'No builds in progress.',
      emptyHistory: 'No recent build activity.',
    },
    inspector: {
      title: 'Inspector',
      backlog: inspectorBacklog,
      active: inspectorActive,
      history: inspectorHistory,
      emptyBacklog: 'No blocked work packets.',
      emptyActive: 'No WPs awaiting review.',
      emptyHistory: 'No recent inspections.',
    },
    evaluator: {
      title: 'Evaluator',
      backlog: evaluatorBacklog,
      active: evaluatorActive,
      history: evaluatorHistory,
      emptyBacklog: 'Run /agent-evaluator quarterly.',
      emptyActive: 'No evaluation in progress.',
      emptyHistory: 'No evaluation reports yet.',
    },
  };
}
