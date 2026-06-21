/**
 * Types for the Build Vision & Roadmap surface.
 *
 * The roadmap data (`data/buildRoadmap.ts`) is the dashboard's runtime mirror of
 * `apps/dashboard/docs/build-vision-and-roadmap.md`; the on-schedule computation
 * in `composables/useBuildRoadmap.ts` consumes these shapes. The canonical
 * arrays below are drift-pinned against their unions by
 * `types/roadmap.drift.test.ts` (mirrors the `MATCH_PHASES` / sweep / triage
 * drift-detection pattern in `.claude/rules/code-style.md`).
 */

/** The four workstreams that turn the vision into reality. */
export type WorkstreamId = 'command-center' | 'product-content' | 'revenue-engine' | 'audience';

export const WORKSTREAM_IDS: readonly WorkstreamId[] = [
  'command-center',
  'product-content',
  'revenue-engine',
  'audience',
];

export const WORKSTREAM_LABELS: Readonly<Record<WorkstreamId, string>> = {
  'command-center': 'Operator Command Center',
  'product-content': 'Product & Content',
  'revenue-engine': 'Revenue Engine',
  audience: 'Audience',
};

/** Authored task status — the operator's declaration of where a task stands. */
export type TaskStatus = 'done' | 'in-progress' | 'next' | 'not-started' | 'blocked';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'done',
  'in-progress',
  'next',
  'not-started',
  'blocked',
];

/**
 * Derived schedule state — computed from status + target date vs. now by the
 * deterministic rule in `build-vision-and-roadmap.md` §4. This is what the
 * page colors and the schedule-watch agent escalates on.
 */
export type TaskState = 'done' | 'on-track' | 'due-soon' | 'overdue' | 'blocked';

export const TASK_STATES: readonly TaskState[] = [
  'done',
  'on-track',
  'due-soon',
  'overdue',
  'blocked',
];

export interface RoadmapTask {
  id: string;
  workstream: WorkstreamId;
  title: string;
  /** The owning agent/role from the checks-and-balances model (display-only). */
  agent: string;
  /** 'YYYY-MM-DD' target date, or null for an ongoing task with no fixed deadline. */
  targetDate: string | null;
  status: TaskStatus;
  /** The concrete definition of done — what makes this task finished. */
  doneDefinition: string;
}

/** A task with its computed schedule state attached. */
export interface TaskWithState extends RoadmapTask {
  state: TaskState;
}

export interface WorkstreamSummary {
  id: WorkstreamId;
  label: string;
  /** Worst non-blocked task state in this workstream (blocked listed separately). */
  state: TaskState;
  tasks: readonly TaskWithState[];
}

export interface RoadmapCounts {
  total: number;
  done: number;
  onTrack: number;
  dueSoon: number;
  overdue: number;
  blocked: number;
}

export interface RoadmapSummary {
  /** Worst workstream state — the one-glance "am I on schedule?" answer. */
  overallState: TaskState;
  workstreams: readonly WorkstreamSummary[];
  counts: RoadmapCounts;
}
