import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(TEST_FILE_DIR, '..', '..');
const SNAPSHOT_PATH = resolve(DASHBOARD_DIR, 'src/data/governance-snapshot.json');

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
    schemaVersion: 2,
    throughput: {
      byWeek: [
        { key: '2026-W21', done: 2, drafted: 0 },
        { key: '2026-W22', done: 5, drafted: 1 },
      ],
      byMonth: [{ key: '2026-05', done: 7, drafted: 1 }],
      byQuarter: [{ key: '2026-Q2', done: 7, drafted: 1 }],
      inFlight: [
        { number: 198, title: 'Dashboard Ops Patterns', status: 'Draft', dependencies: [] },
      ],
      blocked: [],
      now: [{ number: 198, title: 'Dashboard Ops Patterns', status: 'Draft', dependencies: [] }],
    },
    decisions: [
      {
        id: 'D-19803',
        title: 'VisionCard Posture',
        body: 'Body 19803',
        mtime: '2026-06-02T09:00:00-07:00',
      },
      {
        id: 'D-19802',
        title: 'KPI Threshold',
        body: 'Body 19802',
        mtime: '2026-06-01T09:00:00-07:00',
      },
      {
        id: 'D-19801',
        title: 'Cadence Union',
        body: 'Body 19801',
        mtime: '2026-05-31T09:00:00-07:00',
      },
    ],
    commits: [
      { sha: 'e44da7e', kind: 'WP', title: 'EC-224a: WP-198 sub-tasks A+B+C' },
      { sha: '5828694', kind: 'SPEC', title: 'SPEC: harden WP-198 + EC-224a/b' },
      { sha: '59d9e86', kind: 'WP', title: 'WP-196: dashboard widgets' },
    ],
    status: [
      {
        wpNumber: 198,
        ecNumber: '224b',
        title: 'Dashboard Ops Machine Patterns (Governance Snapshot Generator)',
        date: '2026-06-02',
        body: 'The Overview surfaces two more Founder OS Ops Machine patterns ...',
        filePath: 'docs/ai/work-packets/WP-198-dashboard-ops-machine-patterns.md',
      },
      {
        wpNumber: 198,
        ecNumber: '224a',
        title: 'Dashboard Ops Machine Patterns (UI)',
        date: '2026-06-02',
        body: 'The Overview surfaces three Founder OS Ops Machine patterns ...',
        filePath: 'docs/ai/work-packets/WP-198-dashboard-ops-machine-patterns.md',
      },
      {
        wpNumber: 196,
        ecNumber: '225',
        title: 'Dashboard Net Revenue + Paid-Action Errors Widgets',
        date: '2026-06-02',
        body: '/monetization now surfaces two new widgets that close the financial-visibility gap ...',
        filePath: 'docs/ai/work-packets/WP-196-dashboard-net-revenue-and-paid-action-errors.md',
      },
    ],
    governanceKpis: {
      wpsDoneThisWeek: 4,
      daysSinceLastDoneFlip: 0,
      openDrafts: 2,
    },
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
  assert.ok(
    mtimes[0]! >= mtimes[1]!,
    'decisions must arrive in mtime-descending order from the snapshot',
  );
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
    schemaVersion: 2,
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
    schemaVersion: 2,
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

test('12. statusEntries(limit) returns the first N entries of the snapshot status array', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  const entries = result.statusEntries(2);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.wpNumber, 198);
  assert.equal(entries[0]?.ecNumber, '224b');
  assert.equal(entries[1]?.wpNumber, 198);
  assert.equal(entries[1]?.ecNumber, '224a');
});

test('13. statusEntries(N) returns an empty array when the snapshot carries an error field', () => {
  const errorSnapshot: import('./useGovernanceSnapshot.js').GovernanceSnapshot = {
    generatedAt: '2026-06-02T09:00:00-07:00',
    schemaVersion: 2,
    error: 'Generator failed.',
  };
  const result = governance.useGovernanceSnapshot(errorSnapshot);
  assert.deepEqual(result.statusEntries(10), []);
});

test('14. statusEntries(N) returns an empty array when the snapshot omits the status field (v1 forward-compat)', () => {
  const v1Snapshot: import('./useGovernanceSnapshot.js').GovernanceSnapshot = {
    generatedAt: '2026-06-02T09:00:00-07:00',
    schemaVersion: 1,
    throughput: {
      byWeek: [],
      byMonth: [],
      byQuarter: [],
      inFlight: [],
      blocked: [],
      now: [],
    },
    decisions: [],
    commits: [],
  };
  const result = governance.useGovernanceSnapshot(v1Snapshot);
  assert.deepEqual(result.statusEntries(10), []);
});

test('15. governanceKpis() returns the snapshot field verbatim', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  const kpis = result.governanceKpis();
  assert.notEqual(
    kpis,
    null,
    'governanceKpis must be non-null on a non-error snapshot with the field present',
  );
  assert.equal(kpis?.wpsDoneThisWeek, 4);
  assert.equal(kpis?.daysSinceLastDoneFlip, 0);
  assert.equal(kpis?.openDrafts, 2);
});

test('16. governanceKpis() returns null when the snapshot carries an error field', () => {
  const errorSnapshot: import('./useGovernanceSnapshot.js').GovernanceSnapshot = {
    generatedAt: '2026-06-02T09:00:00-07:00',
    schemaVersion: 2,
    error: 'Generator failed.',
  };
  const result = governance.useGovernanceSnapshot(errorSnapshot);
  assert.equal(result.governanceKpis(), null);
});

test('17. governanceKpis() returns null when the snapshot omits the field (v1 forward-compat)', () => {
  const v1Snapshot: import('./useGovernanceSnapshot.js').GovernanceSnapshot = {
    generatedAt: '2026-06-02T09:00:00-07:00',
    schemaVersion: 1,
    throughput: {
      byWeek: [],
      byMonth: [],
      byQuarter: [],
      inFlight: [],
      blocked: [],
      now: [],
    },
    decisions: [],
    commits: [],
  };
  const result = governance.useGovernanceSnapshot(v1Snapshot);
  assert.equal(result.governanceKpis(), null);
});

test('18. governanceKpis() returns three concrete numbers (D-19908 null-discipline)', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  const kpis = result.governanceKpis();
  // why: D-19908 — when the accessor returns non-null, every field MUST be a
  // concrete number (never null, never undefined). Type guard rejects
  // partial-state payloads.
  assert.notEqual(kpis, null);
  assert.equal(typeof kpis?.wpsDoneThisWeek, 'number');
  assert.equal(typeof kpis?.daysSinceLastDoneFlip, 'number');
  assert.equal(typeof kpis?.openDrafts, 'number');
});

test('19. emitted snapshot schemaVersion is exactly 2 (D-19904)', () => {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { schemaVersion: number };
  assert.equal(parsed.schemaVersion, 2);
});

test('20. emitted snapshot has the closed 7-key top-level set lex-sorted (D-19904)', () => {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const keys = Object.keys(parsed).sort();
  assert.deepEqual(keys, [
    'commits',
    'decisions',
    'generatedAt',
    'governanceKpis',
    'schemaVersion',
    'status',
    'throughput',
  ]);
});

test('21. emitted snapshot StatusEntry shape locks the 6-key field set', () => {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { status: Array<Record<string, unknown>> };
  if (parsed.status.length === 0) {
    return;
  }
  const expected = ['body', 'date', 'ecNumber', 'filePath', 'title', 'wpNumber'];
  for (const entry of parsed.status) {
    assert.deepEqual(Object.keys(entry).sort(), expected);
  }
});

test('22. emitted snapshot StatusEntry body is capped at 480 characters (D-19901)', () => {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { status: Array<{ body: string }> };
  for (const entry of parsed.status) {
    assert.ok(
      entry.body.length <= 480,
      `StatusEntry body must be capped at 480 characters; observed ${entry.body.length}`,
    );
  }
});

test('23. emitted snapshot GovernanceKpis shape locks the 3-key field set (D-19908)', () => {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { governanceKpis: Record<string, unknown> };
  const keys = Object.keys(parsed.governanceKpis).sort();
  assert.deepEqual(keys, ['daysSinceLastDoneFlip', 'openDrafts', 'wpsDoneThisWeek']);
});

test('24. emitted snapshot status array is capped at 50 entries (D-19901)', () => {
  const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as { status: unknown[] };
  assert.ok(
    parsed.status.length <= 50,
    `STATUS entries cap is 50; observed ${parsed.status.length}`,
  );
});

test('25. statusEntries tie-break preserves top-to-bottom file order for same-date entries (D-19905)', () => {
  const snapshot = makeMockSnapshot();
  const result = governance.useGovernanceSnapshot(snapshot);
  const entries = result.statusEntries(5);
  // Mock has two 2026-06-02 entries: 198/224b before 198/224a (top-to-bottom).
  // The composable returns them in snapshot order; the generator's sort
  // already placed them with byte-offset ascending tie-break.
  assert.equal(entries[0]?.ecNumber, '224b');
  assert.equal(entries[1]?.ecNumber, '224a');
});
