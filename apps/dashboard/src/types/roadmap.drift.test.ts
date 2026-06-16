import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKSTREAM_IDS, WORKSTREAM_LABELS, TASK_STATUSES, TASK_STATES } from './roadmap.js';

// Drift detection: the canonical readonly arrays must match their unions exactly.
// Pattern mirrors `types/sweep.drift.test.ts` / `types/triage.drift.test.ts` and
// the `.claude/rules/code-style.md §Drift Detection` rule. Updating a union
// without updating its array (or vice versa) fails here.

test('WORKSTREAM_IDS matches the WorkstreamId union exactly', () => {
  assert.deepEqual(
    [...WORKSTREAM_IDS],
    ['command-center', 'product-content', 'revenue-engine', 'audience'],
  );
});

test('every workstream id has exactly one label and there are no orphan labels', () => {
  for (const workstreamId of WORKSTREAM_IDS) {
    assert.equal(typeof WORKSTREAM_LABELS[workstreamId], 'string');
    assert.ok(WORKSTREAM_LABELS[workstreamId].length > 0);
  }
  assert.equal(Object.keys(WORKSTREAM_LABELS).length, WORKSTREAM_IDS.length);
});

test('TASK_STATUSES matches the TaskStatus union exactly', () => {
  assert.deepEqual([...TASK_STATUSES], ['done', 'in-progress', 'next', 'not-started', 'blocked']);
});

test('TASK_STATES matches the TaskState union exactly', () => {
  assert.deepEqual([...TASK_STATES], ['done', 'on-track', 'due-soon', 'overdue', 'blocked']);
});
