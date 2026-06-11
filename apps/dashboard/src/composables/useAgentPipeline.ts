import { useGovernanceSnapshot, type GovernanceSnapshot } from './useGovernanceSnapshot.js';
import { computeSweepHealthRate } from './useSweepHealth.js';
import type { SweepRunSummary } from '../types/sweep.js';

/**
 * A single item rendered in one of the four pipeline lanes.
 */
export interface PipelineItem {
  readonly id: string;
  readonly label: string;
  readonly meta?: string;
}

/**
 * The projection of `UseSweepHealthReturn` the Pipeline page passes into the
 * composable. The page extracts these three fields from the sweep-health
 * composable and hands them in as a plain object so this composable never
 * imports the sweep fetch composable directly and stays testable via object
 * injection — the same
 * dependency-injection shape as `snapshotOverride` (D-23001). Anomaly keys
 * inside `latestRun.anomalyCounts` are opaque strings (D-20703); this composable
 * never compares them against a literal anomaly-class name.
 */
export interface PipelineSweepData {
  readonly latestRun: SweepRunSummary | null;
  readonly staleStatus: 'fresh' | 'stale';
  readonly totalAnomalySparkline: readonly number[];
}

/**
 * Urgency levels aligned with the business scorecard action triggers
 * (business-scorecard-metrics.md §7). Critical = score 1.x (stop everything),
 * high = score 2.x (fix in 14 days), moderate = score 3.x (improve in 30 days),
 * strategic = score 4-5 (maintain and plan ahead).
 */
export type PriorityUrgency = 'critical' | 'high' | 'moderate' | 'strategic';

/**
 * Time horizons for priority recommendations. Each agent lane produces exactly
 * one recommendation per horizon.
 */
export type PriorityHorizon = 'today' | 'this-week' | 'this-month' | 'this-quarter';

/**
 * A single priority recommendation — one actionable sentence per time horizon,
 * framed around "no margin, no mission" (VISION.md §Financial Sustainability).
 */
export interface PriorityRecommendation {
  readonly horizon: PriorityHorizon;
  readonly label: string;
  readonly urgency: PriorityUrgency;
}

/**
 * A single pipeline lane with a top-priority strip and three temporal columns.
 */
export interface PipelineLane {
  readonly title: string;
  readonly priorities: readonly PriorityRecommendation[];
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

/**
 * Classify the direction of the anomaly sparkline as a coarse trend signal.
 * The sparkline is most-recent-first (index 0 is the newest run), so a newest
 * value below the oldest means anomalies fell across the window ('improving');
 * above means they rose ('worsening'); equal — or fewer than two points — is
 * 'stable'. Pure endpoint comparison: deterministic and order-stable.
 */
function deriveTrendDirection(sparkline: readonly number[]): 'improving' | 'worsening' | 'stable' {
  if (sparkline.length < 2) {
    return 'stable';
  }
  const mostRecent = sparkline[0]!;
  const oldest = sparkline[sparkline.length - 1]!;
  if (mostRecent < oldest) {
    return 'improving';
  }
  if (mostRecent > oldest) {
    return 'worsening';
  }
  return 'stable';
}

const EVALUATOR_PLACEHOLDER =
  'No acquisition-readiness evaluation recorded yet. Run the Evaluator quarterly per code-checks-and-balances.md §7.';

/**
 * Snapshot-derived inputs used by the priority recommendation engine.
 */
interface PriorityInputs {
  readonly openDrafts: number;
  readonly wpsDoneThisWeek: number;
  readonly daysSinceLastDoneFlip: number;
  readonly inFlightCount: number;
  readonly blockedCount: number;
  readonly nextExecutableCount: number;
  readonly hasRecentSpecCommit: boolean;
  readonly hasRecentWpCommit: boolean;
  readonly statusEntryCount: number;
  // Sweep-derived signals (WP-230). They stay zero / null when no sweep data is
  // supplied, which keeps every generic recommendation branch reachable for
  // pre-WP-230 callers — backward compatible.
  readonly sweepFatalCount: number;
  readonly sweepHealthRate: number | null;
  readonly sweepStaleStatus: 'fresh' | 'stale' | null;
}

/**
 * Derive Architect priorities from snapshot KPIs. The Architect's job is to
 * keep specs ahead of the Builder — if the spec pipeline dries up, the
 * Builder stalls and revenue stops.
 */
function deriveArchitectPriorities(inputs: PriorityInputs): PriorityRecommendation[] {
  const priorities: PriorityRecommendation[] = [];

  if (inputs.openDrafts >= 3) {
    priorities.push({
      horizon: 'today',
      label: `${inputs.openDrafts} drafts without specs — spec the highest-value WP now or the Builder stalls.`,
      urgency: 'critical',
    });
  } else if (inputs.openDrafts >= 1) {
    priorities.push({
      horizon: 'today',
      label: `${inputs.openDrafts} draft(s) need specs — keep the Builder fed.`,
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'today',
      label: 'All drafts are specced. Review the backlog for the next revenue-critical feature.',
      urgency: 'strategic',
    });
  }

  if (inputs.sweepHealthRate !== null && inputs.sweepHealthRate < 0.8) {
    // why: a low sweep health rate signals spec-coverage gaps the Architect
    // owns; it outranks the generic spec-cadence recommendation this horizon.
    priorities.push({
      horizon: 'this-week',
      label: `Sweep health rate ${Math.round(inputs.sweepHealthRate * 100)}% — close the spec coverage gaps the nightly sweep surfaced.`,
      urgency: 'high',
    });
  } else if (!inputs.hasRecentSpecCommit) {
    priorities.push({
      horizon: 'this-week',
      label: 'No SPEC commits this cycle — ship at least one spec to unblock downstream work.',
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'this-week',
      label: 'Spec activity on track. Prioritize specs that unblock the most revenue-adjacent WPs.',
      urgency: 'moderate',
    });
  }

  if (inputs.inFlightCount > 5) {
    priorities.push({
      horizon: 'this-month',
      label: `${inputs.inFlightCount} WPs in flight — triage scope before adding more specs.`,
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'this-month',
      label: 'Pipeline depth is healthy. Draft specs for the next milestone.',
      urgency: 'strategic',
    });
  }

  priorities.push({
    horizon: 'this-quarter',
    label: 'Ensure every revenue-critical feature has a specced WP before quarter-end.',
    urgency: 'strategic',
  });

  return priorities;
}

/**
 * Derive Builder priorities. The Builder is the direct revenue engine — code
 * that ships is code that earns. "No margin, no mission" starts here.
 */
function deriveBuilderPriorities(inputs: PriorityInputs): PriorityRecommendation[] {
  const priorities: PriorityRecommendation[] = [];

  if (inputs.sweepFatalCount > 0) {
    // why: a fatal-class sweep anomaly is a crashing engine path — it overrides
    // the generic "pick the next WP" recommendation for today.
    priorities.push({
      horizon: 'today',
      label: `${inputs.sweepFatalCount} fatal sweep crash(es) — fix the crashing path before starting new work.`,
      urgency: 'critical',
    });
  } else if (inputs.nextExecutableCount === 0) {
    priorities.push({
      horizon: 'today',
      label: 'No executable WPs — escalate to Architect. Builder is idle, revenue is stalled.',
      urgency: 'critical',
    });
  } else if (inputs.blockedCount > 0) {
    priorities.push({
      horizon: 'today',
      label: `${inputs.blockedCount} blocked WP(s) — unblock before starting new work.`,
      urgency: 'critical',
    });
  } else {
    priorities.push({
      horizon: 'today',
      label: `${inputs.nextExecutableCount} WP(s) ready — pick the one closest to shipping revenue.`,
      urgency: 'moderate',
    });
  }

  if (inputs.wpsDoneThisWeek === 0) {
    priorities.push({
      horizon: 'this-week',
      label: 'Zero WPs shipped this week — close at least one to maintain velocity.',
      urgency: 'critical',
    });
  } else if (inputs.wpsDoneThisWeek <= 2) {
    priorities.push({
      horizon: 'this-week',
      label: `${inputs.wpsDoneThisWeek} WP(s) done — push for one more to stay on pace.`,
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'this-week',
      label: `${inputs.wpsDoneThisWeek} WPs shipped — strong week. Focus on quality over quantity.`,
      urgency: 'strategic',
    });
  }

  if (inputs.inFlightCount > 5) {
    priorities.push({
      horizon: 'this-month',
      label: `${inputs.inFlightCount} WPs in flight — finish before starting. Payroll doesn't wait.`,
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'this-month',
      label: 'In-flight count is manageable. Ship the revenue-critical path first.',
      urgency: 'moderate',
    });
  }

  priorities.push({
    horizon: 'this-quarter',
    label: 'Deliver the minimum shippable product. Every unshipped feature is unrealized revenue.',
    urgency: 'strategic',
  });

  return priorities;
}

/**
 * Derive Inspector priorities. The Inspector protects quality — shipping
 * broken code costs more than shipping slow.
 */
function deriveInspectorPriorities(inputs: PriorityInputs): PriorityRecommendation[] {
  const priorities: PriorityRecommendation[] = [];

  if (inputs.sweepFatalCount > 0) {
    // why: a fatal-class sweep anomaly is the most severe triage signal the
    // Inspector can act on; it overrides the generic blocked-WP recommendation.
    priorities.push({
      horizon: 'today',
      label: `${inputs.sweepFatalCount} fatal sweep crash(es) — triage the anomaly signatures before review work.`,
      urgency: 'critical',
    });
  } else if (inputs.blockedCount >= 2) {
    priorities.push({
      horizon: 'today',
      label: `${inputs.blockedCount} WPs blocked — investigate and unblock. Blocked work is dead capital.`,
      urgency: 'critical',
    });
  } else if (inputs.blockedCount === 1) {
    priorities.push({
      horizon: 'today',
      label: '1 blocked WP — diagnose the root cause and route to Architect or Builder.',
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'today',
      label: 'No blocks. Review the most recently completed WP for spec compliance.',
      urgency: 'moderate',
    });
  }

  if (inputs.hasRecentWpCommit && inputs.statusEntryCount === 0) {
    priorities.push({
      horizon: 'this-week',
      label: 'WP commits landed without inspection reports — review gap is growing.',
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'this-week',
      label: 'Review cadence looks healthy. Focus on highest-risk completed WPs.',
      urgency: 'moderate',
    });
  }

  priorities.push({
    horizon: 'this-month',
    label: 'Audit governance doc drift — ARCHITECTURE.md, DECISIONS.md, and rules must match code.',
    urgency: 'moderate',
  });

  priorities.push({
    horizon: 'this-quarter',
    label:
      'Run a full inspection pass on all shipped WPs. Catch accumulated debt before it compounds.',
    urgency: 'strategic',
  });

  return priorities;
}

/**
 * Derive Evaluator priorities. The Evaluator runs quarterly — its urgency
 * is driven by staleness and acquisition-readiness posture.
 */
function deriveEvaluatorPriorities(inputs: PriorityInputs): PriorityRecommendation[] {
  const priorities: PriorityRecommendation[] = [];

  if (inputs.sweepStaleStatus === 'stale') {
    // why: a stale nightly sweep means the acquisition-readiness signal itself
    // is unreliable; chase the sweep cron before evaluating anything else.
    priorities.push({
      horizon: 'today',
      label: 'Nightly sweep is stale — investigate the sweep cron before running an evaluation.',
      urgency: 'high',
    });
  } else if (inputs.daysSinceLastDoneFlip > 7) {
    priorities.push({
      horizon: 'today',
      label: `${inputs.daysSinceLastDoneFlip} days since last WP completed — pipeline may be stalled.`,
      urgency: 'critical',
    });
  } else if (inputs.daysSinceLastDoneFlip > 3) {
    priorities.push({
      horizon: 'today',
      label: `${inputs.daysSinceLastDoneFlip} days since last completion — monitor for stall.`,
      urgency: 'high',
    });
  } else {
    priorities.push({
      horizon: 'today',
      label: 'Completion cadence is healthy. No immediate evaluation needed.',
      urgency: 'strategic',
    });
  }

  priorities.push({
    horizon: 'this-week',
    label: 'Check that shipped WPs map to revenue milestones, not just engineering milestones.',
    urgency: 'moderate',
  });

  priorities.push({
    horizon: 'this-month',
    label:
      'Score the project against business-scorecard-metrics.md. Flag any department below 3.0.',
    urgency: 'moderate',
  });

  priorities.push({
    horizon: 'this-quarter',
    label: 'Run /agent-evaluator for full acquisition-readiness audit. No margin, no mission.',
    urgency: 'strategic',
  });

  return priorities;
}

/**
 * Derives the four-lane Architect → Builder → Inspector → Evaluator pipeline
 * view-model from the build-time governance snapshot. Each lane exposes a
 * "Top Priority" recommendation strip (four time horizons) and three temporal
 * columns — backlog (upcoming work), active (current status), and history
 * (past activity).
 *
 * Governance lane data flows through `useGovernanceSnapshot`. Optional sweep
 * findings flow through the `sweepData` parameter (a projection of the
 * sweep-health composable, extracted and injected by the Pipeline page); this
 * composable introduces no other data source and never fetches sweep data
 * itself.
 */
// why: snapshotOverride is passed to useGovernanceSnapshot so tests can inject
// deterministic fixtures without touching the baked snapshot file (D-22901
// snapshot-only posture).
// why: sweep data is an optional parameter so the composable remains backward
// compatible and testable without sweep fetch infrastructure (D-20703 opacity +
// D-22901 snapshot-only posture extended).
export function useAgentPipeline(
  snapshotOverride?: GovernanceSnapshot,
  sweepData?: PipelineSweepData,
): UseAgentPipelineReturn {
  const snapshot = useGovernanceSnapshot(snapshotOverride);

  const emptyArchitect: PipelineLane = {
    title: 'Architect',
    priorities: [],
    backlog: [],
    active: [],
    history: [],
    emptyBacklog: 'No draft WPs needing specs.',
    emptyActive: 'No recent spec activity.',
    emptyHistory: 'No recent decisions.',
  };
  const emptyBuilder: PipelineLane = {
    title: 'Builder',
    priorities: [],
    backlog: [],
    active: [],
    history: [],
    emptyBacklog: 'No WPs ready to build.',
    emptyActive: 'No builds in progress.',
    emptyHistory: 'No recent build activity.',
  };
  const emptyInspector: PipelineLane = {
    title: 'Inspector',
    priorities: [],
    backlog: [],
    active: [],
    history: [],
    emptyBacklog: 'No blocked work packets.',
    emptyActive: 'No WPs awaiting review.',
    emptyHistory: 'No recent inspections.',
  };
  const emptyEvaluator: PipelineLane = {
    title: 'Evaluator',
    priorities: [],
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

  // --- Sweep findings: opaque-key anomaly breakdown (D-20703) ---
  // Keys are read dynamically via Object.entries and never compared against a
  // literal anomaly-class name. Fatal classification is a substring test on the
  // key so it survives future taxonomy expansion without importing the engine's
  // closed union (D-23002).
  const latestSweepRun = sweepData?.latestRun ?? null;
  const sweepAnomaliesWithCount: Array<{
    readonly key: string;
    readonly count: number;
    readonly isFatal: boolean;
  }> = [];
  let sweepFatalCount = 0;
  if (latestSweepRun !== null) {
    for (const [anomalyKey, anomalyCount] of Object.entries(latestSweepRun.anomalyCounts)) {
      const isFatalKey = anomalyKey.includes('fatal');
      if (isFatalKey) {
        sweepFatalCount += anomalyCount;
      }
      if (anomalyCount > 0) {
        sweepAnomaliesWithCount.push({ key: anomalyKey, count: anomalyCount, isFatal: isFatalKey });
      }
    }
  }

  // why (D-23503): the single health-rate source of truth. `computeSweepHealthRate`
  // names the healthy class and returns null for a 0-cell run
  // (never NaN). It SUPERSEDES the prior `(cellCount − Σ all keys)/cellCount`
  // formula, which was degenerate ≡ 0 on live data (every cell is classified, so
  // the all-keys sum equals cellCount).
  const sweepHealthRate: number | null =
    latestSweepRun !== null ? computeSweepHealthRate(latestSweepRun) : null;

  const priorityInputs: PriorityInputs = {
    openDrafts: kpis?.openDrafts ?? 0,
    wpsDoneThisWeek: kpis?.wpsDoneThisWeek ?? 0,
    daysSinceLastDoneFlip: kpis?.daysSinceLastDoneFlip ?? 0,
    inFlightCount: snapshot.inFlight().length,
    blockedCount: snapshot.blocked().length,
    nextExecutableCount: snapshot.nextExecutable(10).length,
    hasRecentSpecCommit: recentCommits.some((commit) => commit.kind === 'SPEC'),
    hasRecentWpCommit: recentCommits.some((commit) => commit.kind === 'WP'),
    statusEntryCount: recentStatusEntries.length,
    sweepFatalCount,
    sweepHealthRate,
    sweepStaleStatus: latestSweepRun !== null ? (sweepData?.staleStatus ?? 'fresh') : null,
  };

  // --- Architect lane: specs and planning ---
  const architectBacklog: PipelineItem[] = [];
  if (sweepHealthRate !== null && sweepHealthRate < 0.8) {
    const healthPercent = Math.round(sweepHealthRate * 100);
    architectBacklog.push({
      id: 'sweep-architect-health',
      label: `${healthPercent}% sweep health rate — review spec coverage`,
      meta: 'Sweep',
    });
  }
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
  for (const anomaly of sweepAnomaliesWithCount) {
    if (anomaly.isFatal) {
      builderBacklog.push({
        id: `sweep-builder-${anomaly.key}`,
        label: `${anomaly.count} fatal crash(es) — investigate error signatures`,
        meta: 'Sweep',
      });
    }
  }
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
  // why: fatal-class anomalies sort first so the most severe triage items lead
  // the lane; Array.sort is stable, so non-fatal items keep their source order.
  const inspectorSweepAnomalies = [...sweepAnomaliesWithCount].sort(
    (left, right) => Number(right.isFatal) - Number(left.isFatal),
  );
  for (const anomaly of inspectorSweepAnomalies) {
    inspectorBacklog.push({
      id: `sweep-inspector-${anomaly.key}`,
      label: `${anomaly.count} ${anomaly.key} anomaly(s) — triage`,
      meta: 'Sweep',
    });
  }
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

  let evaluatorActive: PipelineItem[];
  if (latestSweepRun !== null) {
    const trendDirection = deriveTrendDirection(sweepData?.totalAnomalySparkline ?? []);
    const freshnessLabel = (sweepData?.staleStatus ?? 'fresh') === 'stale' ? 'stale' : 'fresh';
    evaluatorActive = [
      {
        id: 'sweep-evaluator-freshness',
        label: `Nightly sweep is ${freshnessLabel} — anomaly trend ${trendDirection}`,
        meta: 'Sweep',
      },
    ];
  } else {
    // why: the Evaluator active column is a static placeholder when no sweep
    // data is present — no acquisition-readiness data source exists in v1;
    // enrichment is deferred to a follow-up WP per code-checks-and-balances.md §7.
    evaluatorActive = [
      {
        id: 'evaluator-placeholder',
        label: EVALUATOR_PLACEHOLDER,
      },
    ];
  }

  const evaluatorHistory: PipelineItem[] = [];

  return {
    architect: {
      title: 'Architect',
      priorities: deriveArchitectPriorities(priorityInputs),
      backlog: architectBacklog,
      active: architectActive,
      history: architectHistory,
      emptyBacklog: 'No draft WPs needing specs.',
      emptyActive: 'No recent spec activity.',
      emptyHistory: 'No recent decisions.',
    },
    builder: {
      title: 'Builder',
      priorities: deriveBuilderPriorities(priorityInputs),
      backlog: builderBacklog,
      active: builderActive,
      history: builderHistory,
      emptyBacklog: 'No WPs ready to build.',
      emptyActive: 'No builds in progress.',
      emptyHistory: 'No recent build activity.',
    },
    inspector: {
      title: 'Inspector',
      priorities: deriveInspectorPriorities(priorityInputs),
      backlog: inspectorBacklog,
      active: inspectorActive,
      history: inspectorHistory,
      emptyBacklog: 'No blocked work packets.',
      emptyActive: 'No WPs awaiting review.',
      emptyHistory: 'No recent inspections.',
    },
    evaluator: {
      title: 'Evaluator',
      priorities: deriveEvaluatorPriorities(priorityInputs),
      backlog: evaluatorBacklog,
      active: evaluatorActive,
      history: evaluatorHistory,
      emptyBacklog: 'Run /agent-evaluator quarterly.',
      emptyActive: 'No evaluation in progress.',
      emptyHistory: 'No evaluation reports yet.',
    },
  };
}
