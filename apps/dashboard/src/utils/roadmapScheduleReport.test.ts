import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleReport } from './roadmapScheduleReport.js';
import { summarizeRoadmap } from '../composables/useBuildRoadmap.js';
import type { RoadmapTask } from '../types/roadmap.js';

const NOW_MS = Date.UTC(2026, 5, 16, 12, 0, 0);
const GENERATED_AT = '2026-06-16T12:00:00.000Z';

function makeTask(overrides: Partial<RoadmapTask>): RoadmapTask {
  return {
    id: 'task',
    workstream: 'command-center',
    title: 'A task',
    agent: 'Builder',
    targetDate: '2026-08-01',
    status: 'not-started',
    doneDefinition: 'It is done',
    ...overrides,
  };
}

test('buildScheduleReport flags slippage and lists overdue then due-soon tasks', () => {
  const tasks: RoadmapTask[] = [
    makeTask({ id: 'late', title: 'Late thing', targetDate: '2026-06-15' }), // overdue
    makeTask({ id: 'soon', title: 'Soon thing', targetDate: '2026-06-17' }), // due-soon
    makeTask({ id: 'fine', title: 'Fine thing', targetDate: '2026-08-01' }), // on-track
  ];
  const report = buildScheduleReport(summarizeRoadmap(tasks, NOW_MS), GENERATED_AT);

  assert.equal(report.hasSlippage, true);
  assert.equal(report.title, 'Build schedule watch — 1 overdue, 1 due soon');
  assert.match(report.body, /⛔ Overdue/);
  assert.match(report.body, /Late thing/);
  assert.match(report.body, /was due 2026-06-15/);
  assert.match(report.body, /⏳ Due soon/);
  assert.match(report.body, /Soon thing/);
  assert.match(report.body, /_Generated 2026-06-16T12:00:00.000Z_/);
  // The on-track task is not surfaced as slippage.
  assert.ok(!report.body.includes('Fine thing'));
});

test('buildScheduleReport reports the all-clear when nothing is slipping', () => {
  const tasks: RoadmapTask[] = [
    makeTask({ id: 'done-1', status: 'done' }),
    makeTask({ id: 'ongoing', targetDate: null }), // on-track (ongoing)
    makeTask({ id: 'blocked-1', status: 'blocked' }),
  ];
  const report = buildScheduleReport(summarizeRoadmap(tasks, NOW_MS), GENERATED_AT);

  assert.equal(report.hasSlippage, false);
  assert.equal(report.title, 'Build schedule watch — 0 overdue, 0 due soon');
  assert.match(report.body, /Nothing is slipping/);
});
