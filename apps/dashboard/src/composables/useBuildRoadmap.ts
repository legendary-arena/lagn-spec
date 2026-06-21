import { computed, type ComputedRef } from 'vue';
import { BUILD_ROADMAP } from '../data/buildRoadmap.js';
import {
  WORKSTREAM_IDS,
  WORKSTREAM_LABELS,
  type RoadmapTask,
  type RoadmapSummary,
  type TaskState,
  type TaskWithState,
  type WorkstreamSummary,
} from '../types/roadmap.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A task is "due soon" when it is within this many days of its target date.
 * Mirrors the rule table in `build-vision-and-roadmap.md` §4: `N ≤ T − 3 days`
 * is on-track, the final window up to `T` is due-soon, past `T` is overdue.
 */
export const DUE_SOON_WINDOW_DAYS = 3;

interface UseBuildRoadmapOptions {
  /** Injectable clock returning epoch milliseconds. Tests pass a fixed value. */
  now?: () => number;
  /** Injectable task list. Defaults to the canonical `BUILD_ROADMAP`. */
  tasks?: readonly RoadmapTask[];
}

/**
 * Whole calendar days from `nowMs` to the target date, computed in UTC for both
 * sides so the result never drifts across a DST boundary. Positive means the
 * target is in the future; negative means it has passed. A malformed date
 * string yields `Infinity` (treated as on-track) rather than throwing, so one
 * bad row can never blank the page.
 */
export function computeDaysUntil(targetDate: string, nowMs: number): number {
  const parts = targetDate.split('-');
  const yearPart = parts[0];
  const monthPart = parts[1];
  const dayPart = parts[2];
  if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return Number.POSITIVE_INFINITY;
  }
  const targetMidnightUtc = Date.UTC(year, month - 1, day);
  const nowDate = new Date(nowMs);
  const nowMidnightUtc = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
  );
  return Math.round((targetMidnightUtc - nowMidnightUtc) / MILLISECONDS_PER_DAY);
}

/**
 * Derives a task's schedule state from its authored status and target date,
 * per the deterministic rule in `build-vision-and-roadmap.md` §4. `done` and
 * `blocked` short-circuit; an ongoing task (null target) is always on-track
 * because it carries no deadline.
 */
export function computeTaskState(task: RoadmapTask, nowMs: number): TaskState {
  if (task.status === 'done') {
    return 'done';
  }
  if (task.status === 'blocked') {
    return 'blocked';
  }
  if (task.targetDate === null) {
    return 'on-track';
  }
  const daysUntil = computeDaysUntil(task.targetDate, nowMs);
  if (daysUntil < 0) {
    return 'overdue';
  }
  if (daysUntil < DUE_SOON_WINDOW_DAYS) {
    return 'due-soon';
  }
  return 'on-track';
}

/**
 * The worst state in a set, by the precedence
 * overdue > due-soon > on-track > done, with `blocked` reported only when no
 * non-blocked task exists (blocked is "listed separately", §4). An empty set
 * is on-track — nothing is slipping.
 */
export function worstState(states: readonly TaskState[]): TaskState {
  let hasOverdue = false;
  let hasDueSoon = false;
  let hasOnTrack = false;
  let hasDone = false;
  let hasBlocked = false;
  for (const state of states) {
    if (state === 'overdue') {
      hasOverdue = true;
    } else if (state === 'due-soon') {
      hasDueSoon = true;
    } else if (state === 'on-track') {
      hasOnTrack = true;
    } else if (state === 'done') {
      hasDone = true;
    } else {
      hasBlocked = true;
    }
  }
  if (hasOverdue) {
    return 'overdue';
  }
  if (hasDueSoon) {
    return 'due-soon';
  }
  if (hasOnTrack) {
    return 'on-track';
  }
  if (hasDone) {
    return 'done';
  }
  if (hasBlocked) {
    return 'blocked';
  }
  return 'on-track';
}

/**
 * Human-readable label for a schedule state. The exhaustive switch anchors the
 * `TaskState` union: adding a state without updating this function fails to
 * compile (`assertNever`), which the drift test relies on.
 */
export function taskStateLabel(state: TaskState): string {
  switch (state) {
    case 'done':
      return 'Done';
    case 'on-track':
      return 'On track';
    case 'due-soon':
      return 'Due soon';
    case 'overdue':
      return 'Overdue';
    case 'blocked':
      return 'Blocked';
    default:
      return assertNever(state);
  }
}

/**
 * Compile-time exhaustiveness guard. Reached only if a new `TaskState` is added
 * to the union without a matching `case` above.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled task state: ${String(value)}`);
}

/**
 * Computes the full roadmap summary — per-task states, per-workstream worst
 * state, the overall on-schedule state, and the headline counts — from the
 * given tasks at the given instant. Pure and deterministic for a fixed
 * `nowMs`, so the page and the schedule-watch agent compute identically.
 */
export function summarizeRoadmap(tasks: readonly RoadmapTask[], nowMs: number): RoadmapSummary {
  const tasksWithState: TaskWithState[] = [];
  for (const task of tasks) {
    tasksWithState.push({ ...task, state: computeTaskState(task, nowMs) });
  }

  const workstreams: WorkstreamSummary[] = [];
  for (const workstreamId of WORKSTREAM_IDS) {
    const workstreamTasks = tasksWithState.filter((task) => task.workstream === workstreamId);
    workstreams.push({
      id: workstreamId,
      label: WORKSTREAM_LABELS[workstreamId],
      state: worstState(workstreamTasks.map((task) => task.state)),
      tasks: workstreamTasks,
    });
  }

  const counts = {
    total: tasksWithState.length,
    done: 0,
    onTrack: 0,
    dueSoon: 0,
    overdue: 0,
    blocked: 0,
  };
  for (const task of tasksWithState) {
    if (task.state === 'done') {
      counts.done += 1;
    } else if (task.state === 'on-track') {
      counts.onTrack += 1;
    } else if (task.state === 'due-soon') {
      counts.dueSoon += 1;
    } else if (task.state === 'overdue') {
      counts.overdue += 1;
    } else {
      counts.blocked += 1;
    }
  }

  const overallState = worstState(workstreams.map((workstream) => workstream.state));
  return { overallState, workstreams, counts };
}

/**
 * Provides the roadmap summary for the Vision & Roadmap page. The clock is read
 * once at call time (the data is static, so there is nothing to react to);
 * tests inject a fixed `now` and a fixture task list.
 */
export function useBuildRoadmap(options?: UseBuildRoadmapOptions): ComputedRef<RoadmapSummary> {
  const nowMs = (options?.now ?? (() => Date.now()))();
  const tasks = options?.tasks ?? BUILD_ROADMAP;
  return computed(() => summarizeRoadmap(tasks, nowMs));
}
