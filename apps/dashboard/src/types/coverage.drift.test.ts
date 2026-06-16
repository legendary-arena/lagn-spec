import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEDGER_STATUSES } from './coverage.js';

// Drift detection: the canonical readonly array must match the LedgerStatus
// union exactly (mirrors `types/roadmap.drift.test.ts` and the
// `.claude/rules/code-style.md §Drift Detection` rule).
test('LEDGER_STATUSES matches the LedgerStatus union exactly', () => {
  assert.deepEqual([...LEDGER_STATUSES], ['executable', 'deferred', 'unsupported', 'unmarked']);
});
