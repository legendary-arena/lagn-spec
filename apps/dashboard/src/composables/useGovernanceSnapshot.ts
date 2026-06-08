import snapshotImport from '../data/governance-snapshot.json';
import type { StatusEntry, GovernanceKpis } from '../types/index.js';

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
  // why: D-19904 — v2 additive fields. v1 snapshots that leak through (a
  // stale `git stash` or a cached build) omit these keys; the accessor
  // fallbacks return empty array / null so the composable never throws.
  readonly status?: readonly StatusEntry[];
  readonly governanceKpis?: GovernanceKpis;
}

export interface UseGovernanceSnapshotReturn {
  readonly throughput: (horizon: HorizonKey) => readonly HorizonCount[];
  readonly inFlight: () => readonly WpRef[];
  readonly blocked: () => readonly WpRef[];
  readonly nextExecutable: (limit: number) => readonly WpRef[];
  readonly decisions: (limit: number) => readonly DecisionEntry[];
  readonly commits: (limit: number) => readonly CommitEntry[];
  readonly statusEntries: (limit: number) => readonly StatusEntry[];
  readonly governanceKpis: () => GovernanceKpis | null;
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
export function useGovernanceSnapshot(
  snapshotOverride?: GovernanceSnapshot,
): UseGovernanceSnapshotReturn {
  const snapshot = snapshotOverride ?? DEFAULT_SNAPSHOT;
  const loadError = typeof snapshot.error === 'string' && snapshot.error.length > 0;
  const throughputBlock = snapshot.throughput ?? EMPTY_THROUGHPUT;
  const decisionsAll = snapshot.decisions ?? [];
  const commitsAll = snapshot.commits ?? [];
  const statusAll = snapshot.status ?? [];

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

  /**
   * Return up to `limit` STATUS entries (newest first per the snapshot's
   * sort) for the StatusFeedWidget. Returns an empty array when the snapshot
   * carries an `error` field or when the `status` field is missing
   * (forward-compat with hypothetical v1 snapshots).
   */
  function statusEntries(limit: number): readonly StatusEntry[] {
    return statusAll.slice(0, limit);
  }

  /**
   * Return the snapshot's governance KPIs. Returns `null` only when the
   * snapshot carries an `error` field OR when the `governanceKpis` field is
   * missing entirely (v1 forward-compat). When non-null, every field is a
   * concrete number per D-19908 — individual field nulls are not a valid
   * state.
   */
  // why: D-19908 — field-level nulls are forbidden but whole-object null is
  // the explicit error state. The composable returns null here only for the
  // whole-snapshot-error / missing-field case; widgets branch on that single
  // null and consume the three concrete numbers without per-field guards.
  function governanceKpis(): GovernanceKpis | null {
    if (loadError) {
      return null;
    }
    if (snapshot.governanceKpis === undefined) {
      return null;
    }
    return snapshot.governanceKpis;
  }

  return {
    throughput,
    inFlight,
    blocked,
    nextExecutable,
    decisions,
    commits,
    statusEntries,
    governanceKpis,
    loadError,
    generatedAt: snapshot.generatedAt,
  };
}
