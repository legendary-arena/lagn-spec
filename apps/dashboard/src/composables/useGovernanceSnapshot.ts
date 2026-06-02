import snapshotImport from '../data/governance-snapshot.json';

export type HorizonKey = 'week' | 'month' | 'quarter';
export type WpStatus = 'Draft' | 'Ready' | 'Done' | 'Blocked';
export type CommitKind = 'WP' | 'SPEC';

export interface HorizonCount {
  readonly key: string;
  readonly done: number;
  readonly drafted: number;
}

export interface WpRef {
  readonly number: number;
  readonly title: string;
  readonly status: WpStatus;
  readonly dependencies: readonly number[];
}

export interface DecisionEntry {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly mtime: string;
}

export interface CommitEntry {
  readonly sha: string;
  readonly kind: CommitKind;
  readonly title: string;
}

export interface ThroughputBlock {
  readonly byWeek: readonly HorizonCount[];
  readonly byMonth: readonly HorizonCount[];
  readonly byQuarter: readonly HorizonCount[];
  readonly inFlight: readonly WpRef[];
  readonly blocked: readonly WpRef[];
  readonly now: readonly WpRef[];
}

export interface GovernanceSnapshot {
  readonly generatedAt: string;
  readonly schemaVersion: number;
  readonly error?: string;
  readonly throughput?: ThroughputBlock;
  readonly decisions?: readonly DecisionEntry[];
  readonly commits?: readonly CommitEntry[];
}

export interface UseGovernanceSnapshotReturn {
  readonly throughput: (horizon: HorizonKey) => readonly HorizonCount[];
  readonly inFlight: () => readonly WpRef[];
  readonly blocked: () => readonly WpRef[];
  readonly nextExecutable: (limit: number) => readonly WpRef[];
  readonly decisions: (limit: number) => readonly DecisionEntry[];
  readonly commits: (limit: number) => readonly CommitEntry[];
  readonly loadError: boolean;
  readonly generatedAt: string;
}

const EMPTY_THROUGHPUT: ThroughputBlock = {
  byWeek: [],
  byMonth: [],
  byQuarter: [],
  inFlight: [],
  blocked: [],
  now: [],
};

// why: D-19804 — snapshot is imported via Vite's static-asset mechanism so a
// missing file at build time surfaces as a build-time vite error (visible
// during build, not as a runtime exception after deploy). The composable
// accepts an optional override parameter so tests can pass mock snapshots
// instead of touching the disk-baked default.
const DEFAULT_SNAPSHOT = snapshotImport as unknown as GovernanceSnapshot;

/**
 * Vue composable exposing typed read-accessors over the build-time
 * governance snapshot. Pure factory — no reactive state of its own; widgets
 * wrap the accessors in `computed` when reactivity to a selected horizon is
 * needed.
 *
 * Caller may pass a `snapshotOverride` to inject a deterministic mock (used
 * by `useGovernanceSnapshot.test.ts`); production callers omit the argument
 * and receive the JSON-imported default.
 */
export function useGovernanceSnapshot(snapshotOverride?: GovernanceSnapshot): UseGovernanceSnapshotReturn {
  const snapshot = snapshotOverride ?? DEFAULT_SNAPSHOT;
  const loadError = typeof snapshot.error === 'string' && snapshot.error.length > 0;
  const throughputBlock = snapshot.throughput ?? EMPTY_THROUGHPUT;
  const decisionsAll = snapshot.decisions ?? [];
  const commitsAll = snapshot.commits ?? [];

  function throughput(horizon: HorizonKey): readonly HorizonCount[] {
    if (horizon === 'week') {
      return throughputBlock.byWeek;
    }
    if (horizon === 'month') {
      return throughputBlock.byMonth;
    }
    return throughputBlock.byQuarter;
  }

  function inFlight(): readonly WpRef[] {
    return throughputBlock.inFlight;
  }

  function blocked(): readonly WpRef[] {
    return throughputBlock.blocked;
  }

  function nextExecutable(limit: number): readonly WpRef[] {
    return throughputBlock.now.slice(0, limit);
  }

  function decisions(limit: number): readonly DecisionEntry[] {
    return decisionsAll.slice(0, limit);
  }

  function commits(limit: number): readonly CommitEntry[] {
    return commitsAll.slice(0, limit);
  }

  return {
    throughput,
    inFlight,
    blocked,
    nextExecutable,
    decisions,
    commits,
    loadError,
    generatedAt: snapshot.generatedAt,
  };
}
