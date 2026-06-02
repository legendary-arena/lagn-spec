import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(TEST_FILE_DIR, '..', '..');

type GovernanceModule = typeof import('./useGovernanceSnapshot.js');

let governance: GovernanceModule;

before(async () => {
  // why: D-19804 — the composable statically imports
  // apps/dashboard/src/data/governance-snapshot.json. Tests inject mock
  // snapshots via the override parameter but the static import still loads
  // at module-evaluation time. Running the generator here guarantees the
  // JSON exists even on a fresh checkout where `pnpm dash:build` has not yet
  // run. The generator never throws (D-19805); worst case it writes an
  // error JSON, which the composable still loads.
  execFileSync('node', ['scripts/build-governance-snapshot.mjs'], {
    cwd: DASHBOARD_DIR,
    stdio: 'inherit',
  });
  governance = await import('./useGovernanceSnapshot.js');
});

function makeMockSnapshot(): import('./useGovernanceSnapshot.js').GovernanceSnapshot {
  return {
    generatedAt: '2026-06-02T09:00:00-07:00',
    schemaVersion: 1,
    throughput: {
      byWeek: [
        { key: '2026-W21', done: 2, drafted: 0 },
        { key: '2026-W22', done: 5, drafted: 1 },
      ],
      byMonth: [
        { key: '2026-05', done: 7, drafted: 1 },
      ],
      byQuarter: [
        { key: '2026-Q2', done: 7, drafted: 1 },
      ],
      inFlight: [
        { number: 198, title: 'Dashboard Ops Patterns', status: 'Draft', dependencies: [] },
      ],
      blocked: [],
      now: [
        { number: 198, title: 'Dashboard Ops Patterns', status: 'Draft', dependencies: [] },
      ],
    },
    decisions: [
      { id: 'D-19803', title: 'VisionCard Posture', body: 'Body 19803', mtime: '2026-06-02T09:00:00-07:00' },
      { id: 'D-19802', title: 'KPI Threshold', body: 'Body 19802', mtime: '2026-06-01T09:00:00-07:00' },
      { id: 'D-19801', title: 'Cadence Union', body: 'Body 19801', mtime: '2026-05-31T09:00:00-07:00' },
    ],
    commits: [
      { sha: 'e44da7e', kind: 'WP', title: 'EC-224a: WP-198 sub-tasks A+B+C' },
      { sha: '5828694', kind: 'SPEC', title: 'SPEC: harden WP-198 + EC-224a/b' },
      { sha: '59d9e86', kind: 'WP', title: 'WP-196: dashboard widgets' },
    ],
  };
}

test('1. throughput("week") returns the byWeek array verbatim', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  assert.deepEqual(result.throughput('week'), snapshot.throughput!.byWeek);
});

test('2. throughput("month") returns the byMonth array', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  assert.deepEqual(result.throughput('month'), snapshot.throughput!.byMonth);
});

test('3. throughput("quarter") returns the byQuarter array', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  assert.deepEqual(result.throughput('quarter'), snapshot.throughput!.byQuarter);
});

test('4. decisions(limit) returns up to N entries preserving snapshot order (mtime descending)', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  const tail = result.decisions(2);
  assert.equal(tail.length, 2);
  assert.equal(tail[0]?.id, 'D-19803');
  assert.equal(tail[1]?.id, 'D-19802');
  const mtimes = tail.map((entry) => entry.mtime);
  assert.ok(mtimes[0]! >= mtimes[1]!, 'decisions must arrive in mtime-descending order from the snapshot');
});

test('5. commits(limit) returns up to N entries preserving snapshot order (commit-order descending)', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  const tail = result.commits(2);
  assert.equal(tail.length, 2);
  assert.equal(tail[0]?.sha, 'e44da7e');
  assert.equal(tail[1]?.sha, '5828694');
});

test('6. loadError is true when the snapshot carries a non-empty error field', () => {
  const errorSnapshot: import('./useGovernanceSnapshot.js').GovernanceSnapshot = {
    generatedAt: '2026-06-02T09:00:00-07:00',
    schemaVersion: 1,
    error: 'Governance snapshot generation failed because the input file is missing.',
  };
  const result = governance.useGovernanceSnapshot(errorSnapshot);
  assert.equal(result.loadError, true);
});

test('7. loadError is false when the snapshot omits the error field', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  assert.equal(result.loadError, false);
});

test('8. nextExecutable(limit) returns the first N entries of the snapshot now array', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  const candidates = result.nextExecutable(5);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.number, 198);
  assert.equal(candidates[0]?.status, 'Draft');
});

test('9. nextExecutable(1) is a no-op slice (does not mutate snapshot)', () => {
  const snapshot = makeMockSnapshot();
  const beforeSnapshot = JSON.stringify(snapshot);
  const result = governance.useGovernanceSnapshot(snapshot);
  result.nextExecutable(1);
  const afterSnapshot = JSON.stringify(snapshot);
  assert.equal(afterSnapshot, beforeSnapshot, 'composable must not mutate the input snapshot');
});

test('11. useDataFreshness source-label drift gate — union includes BUILD alongside LIVE/CACHED/MOCK', () => {
  // why: D-19804 + EC-224b §After Completing — assigning each canonical label
  // to a DataFreshnessSource-typed slot fails vue-tsc compilation if any
  // label is removed or renamed. The runtime check is symbolic; the
  // load-bearing check is the type assignment line above each assert.
  type DataFreshnessSource = import('./useDataFreshness.js').DataFreshnessSource;
  const liveLabel: DataFreshnessSource = 'LIVE';
  const cachedLabel: DataFreshnessSource = 'CACHED';
  const mockLabel: DataFreshnessSource = 'MOCK';
  const buildLabel: DataFreshnessSource = 'BUILD';
  assert.equal(liveLabel, 'LIVE');
  assert.equal(cachedLabel, 'CACHED');
  assert.equal(mockLabel, 'MOCK');
  assert.equal(buildLabel, 'BUILD');
});

test('10. throughput accessors on an error snapshot fall back to empty arrays (no throw)', () => {
  const errorSnapshot: import('./useGovernanceSnapshot.js').GovernanceSnapshot = {
    generatedAt: '2026-06-02T09:00:00-07:00',
    schemaVersion: 1,
    error: 'Generator failed.',
  };
  const result = governance.useGovernanceSnapshot(errorSnapshot);
  assert.deepEqual(result.throughput('week'), []);
  assert.deepEqual(result.inFlight(), []);
  assert.deepEqual(result.blocked(), []);
  assert.deepEqual(result.nextExecutable(5), []);
  assert.deepEqual(result.decisions(5), []);
  assert.deepEqual(result.commits(5), []);
});
