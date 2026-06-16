import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDaysUntil,
  computeTaskState,
  worstState,
  taskStateLabel,
  summarizeRoadmap,
  useBuildRoadmap,
  DUE_SOON_WINDOW_DAYS,
} from './useBuildRoadmap.js';
import type { RoadmapTask, TaskState } from '../types/roadmap.js';

// A fixed instant: 2026-06-16 12:00 UTC. All date math below is relative to it.
const NOW_MS = Date.UTC(2026, 5, 16, 12, 0, 0);

/** Builds a task with sensible defaults so each test overrides only what it asserts. */
function makeTask(overrides: Partial<RoadmapTask>): RoadmapTask {
  return {
    id: 'task',
    workstream: 'command-center',
    title: 'A task',
    agent: 'Builder',
    targetDate: '2026-07-01',
    status: 'not-started',
    doneDefinition: 'It is done',
    ...overrides,
  };
}

test('computeDaysUntil returns whole-day deltas in both directions', () => {
  assert.equal(computeDaysUntil('2026-06-16', NOW_MS), 0);
  assert.equal(computeDaysUntil('2026-06-18', NOW_MS), 2);
  assert.equal(computeDaysUntil('2026-06-19', NOW_MS), 3);
  assert.equal(computeDaysUntil('2026-06-15', NOW_MS), -1);
  assert.equal(computeDaysUntil('2026-07-01', NOW_MS), 15);
});

test('computeDaysUntil returns Infinity for a malformed date', () => {
  assert.equal(computeDaysUntil('2026-06', NOW_MS), Number.POSITIVE_INFINITY);
  assert.equal(computeDaysUntil('2026-XX-01', NOW_MS), Number.POSITIVE_INFINITY);
});

test('computeTaskState short-circuits on done and blocked status', () => {
  assert.equal(
    computeTaskState(makeTask({ status: 'done', targetDate: '2020-01-01' }), NOW_MS),
    'done',
  );
  assert.equal(
    computeTaskState(makeTask({ status: 'blocked', targetDate: '2020-01-01' }), NOW_MS),
    'blocked',
  );
});

test('computeTaskState treats an ongoing (null target) task as on-track', () => {
  assert.equal(computeTaskState(makeTask({ targetDate: null }), NOW_MS), 'on-track');
});

test('computeTaskState derives overdue / due-soon / on-track from the target date', () => {
  assert.equal(computeTaskState(makeTask({ targetDate: '2026-06-15' }), NOW_MS), 'overdue');
  assert.equal(computeTaskState(makeTask({ targetDate: '2026-06-16' }), NOW_MS), 'due-soon');
  assert.equal(computeTaskState(makeTask({ targetDate: '2026-06-18' }), NOW_MS), 'due-soon');
  // boundary: exactly DUE_SOON_WINDOW_DAYS out is still on-track (N ≤ T − 3 days)
  assert.equal(DUE_SOON_WINDOW_DAYS, 3);
  assert.equal(computeTaskState(makeTask({ targetDate: '2026-06-19' }), NOW_MS), 'on-track');
});

test('worstState honors the overdue > due-soon > on-track > done precedence', () => {
  assert.equal(worstState(['done', 'on-track', 'overdue']), 'overdue');
  assert.equal(worstState(['done', 'due-soon', 'on-track']), 'due-soon');
  assert.equal(worstState(['done', 'on-track']), 'on-track');
  assert.equal(worstState(['done', 'done']), 'done');
});

test('worstState reports blocked only when nothing else is present, and on-track when empty', () => {
  assert.equal(worstState(['blocked', 'blocked']), 'blocked');
  assert.equal(worstState(['blocked', 'done']), 'done');
  assert.equal(worstState([]), 'on-track');
});

test('taskStateLabel covers every state and throws on an unknown one', () => {
  assert.equal(taskStateLabel('done'), 'Done');
  assert.equal(taskStateLabel('on-track'), 'On track');
  assert.equal(taskStateLabel('due-soon'), 'Due soon');
  assert.equal(taskStateLabel('overdue'), 'Overdue');
  assert.equal(taskStateLabel('blocked'), 'Blocked');
  assert.throws(() => taskStateLabel('mystery' as unknown as TaskState));
});

test('summarizeRoadmap rolls up counts, workstream states, and the overall state', () => {
  const tasks: RoadmapTask[] = [
    makeTask({ id: 'a', workstream: 'command-center', status: 'done' }),
    makeTask({ id: 'b', workstream: 'command-center', targetDate: '2026-06-15' }), // overdue
    makeTask({ id: 'c', workstream: 'revenue-engine', status: 'blocked' }),
    makeTask({ id: 'd', workstream: 'audience', targetDate: null }), // on-track (ongoing)
  ];
  const summary = summarizeRoadmap(tasks, NOW_MS);

  assert.equal(summary.counts.total, 4);
  assert.equal(summary.counts.done, 1);
  assert.equal(summary.counts.overdue, 1);
  assert.equal(summary.counts.blocked, 1);
  assert.equal(summary.counts.onTrack, 1);
  assert.equal(summary.counts.dueSoon, 0);

  // Four workstreams are always present, in canonical order.
  assert.equal(summary.workstreams.length, 4);
  const commandCenter = summary.workstreams.find(
    (workstream) => workstream.id === 'command-center',
  );
  assert.equal(commandCenter?.state, 'overdue'); // worst of done + overdue
  const revenue = summary.workstreams.find((workstream) => workstream.id === 'revenue-engine');
  assert.equal(revenue?.state, 'blocked'); // only a blocked task
  const productContent = summary.workstreams.find(
    (workstream) => workstream.id === 'product-content',
  );
  assert.equal(productContent?.tasks.length, 0); // empty workstream
  assert.equal(productContent?.state, 'on-track');

  assert.equal(summary.overallState, 'overdue');
});

test('useBuildRoadmap reads the injected clock and task list', () => {
  const tasks: RoadmapTask[] = [makeTask({ id: 'x', targetDate: '2026-06-15' })];
  const summary = useBuildRoadmap({ now: () => NOW_MS, tasks });
  assert.equal(summary.value.counts.overdue, 1);
  assert.equal(summary.value.overallState, 'overdue');
});

test('useBuildRoadmap falls back to the canonical roadmap when no tasks are injected', () => {
  const summary = useBuildRoadmap({ now: () => NOW_MS });
  // The canonical BUILD_ROADMAP is non-empty and spans all four workstreams.
  assert.ok(summary.value.counts.total > 0);
  assert.equal(summary.value.workstreams.length, 4);
});
