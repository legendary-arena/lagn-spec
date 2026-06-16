import { computed, type ComputedRef } from 'vue';
import ledgerData from '../data/coverage-ledger.json';
import type {
  CoverageLedger,
  LedgerRow,
  LedgerStatus,
  LedgerSummary,
  MechanicEntry,
} from '../types/coverage.js';

// why: the unmarked sentinel mirrors the generator (`scripts/hero-mechanic-ledger.mjs`)
// — an unmarked row is a per-card DATA todo, not a mechanic, so it is excluded
// from the by-mechanic dictionary (but still counted in the summary).
const UNMARKED_MECHANIC = '(unmarked)';

/**
 * Display label for a ledger status. The exhaustive switch anchors the
 * `LedgerStatus` union — adding a status without a case fails to compile.
 */
export function statusLabel(status: LedgerStatus): string {
  switch (status) {
    case 'executable':
      return 'Executable';
    case 'deferred':
      return 'Deferred';
    case 'unsupported':
      return 'Unsupported';
    case 'unmarked':
      return 'Unmarked';
    default:
      return assertNever(status);
  }
}

/** Compile-time exhaustiveness guard for `statusLabel` / `statusRank`. */
function assertNever(value: never): never {
  throw new Error(`Unhandled ledger status: ${String(value)}`);
}

/**
 * Sort rank for the worklist: `unsupported` (the real code TODO) first,
 * `executable` (done) last. Lower sorts earlier.
 */
function statusRank(status: LedgerStatus): number {
  switch (status) {
    case 'unsupported':
      return 0;
    case 'unmarked':
      return 1;
    case 'deferred':
      return 2;
    case 'executable':
      return 3;
    default:
      return assertNever(status);
  }
}

/**
 * Builds the by-mechanic dictionary — one entry per distinct mechanic, the
 * implementation worklist (implementing one mechanic clears every card using
 * it). Excludes the `(unmarked)` sentinel. Sorted worklist-first: unsupported
 * before done, then by card count descending, then by name.
 */
export function buildMechanicDictionary(rows: readonly LedgerRow[]): MechanicEntry[] {
  const byMechanic = new Map<string, MechanicEntry>();
  for (const row of rows) {
    if (row.mechanic === UNMARKED_MECHANIC) {
      continue;
    }
    const existing = byMechanic.get(row.mechanic);
    if (existing === undefined) {
      byMechanic.set(row.mechanic, {
        mechanic: row.mechanic,
        status: row.status,
        cardCount: 1,
        wp: row.wp,
        decision: row.decision,
        handler: row.handler,
      });
    } else {
      existing.cardCount += 1;
    }
  }

  const entries = [...byMechanic.values()];
  entries.sort((left, right) => {
    const rankDiff = statusRank(left.status) - statusRank(right.status);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    if (left.cardCount !== right.cardCount) {
      return right.cardCount - left.cardCount;
    }
    if (left.mechanic < right.mechanic) {
      return -1;
    }
    if (left.mechanic > right.mechanic) {
      return 1;
    }
    return 0;
  });
  return entries;
}

/**
 * Executable share of all ledger rows as a 0–100 number rounded to one decimal.
 * Zero rows yields 0 (avoids divide-by-zero on the empty-stub ledger).
 */
export function executablePercent(ledger: CoverageLedger): number {
  if (ledger.summary.totalRows === 0) {
    return 0;
  }
  return Math.round((ledger.summary.byStatus.executable / ledger.summary.totalRows) * 1000) / 10;
}

interface UseCoverageLedgerOptions {
  /** Injectable ledger. Defaults to the build-time bundled ledger. */
  ledger?: CoverageLedger;
}

interface UseCoverageLedgerReturn {
  summary: ComputedRef<LedgerSummary>;
  rows: ComputedRef<readonly LedgerRow[]>;
  mechanics: ComputedRef<MechanicEntry[]>;
  percentExecutable: ComputedRef<number>;
  error: string | undefined;
}

/**
 * Provides the coverage ledger for the Coverage page: the raw rows (by-card
 * view), the by-mechanic dictionary (worklist view), the status summary, and
 * the executable percentage. The bundled data is static, so everything is
 * computed once; tests inject a fixture ledger.
 */
export function useCoverageLedger(options?: UseCoverageLedgerOptions): UseCoverageLedgerReturn {
  const ledger = options?.ledger ?? (ledgerData as unknown as CoverageLedger);
  return {
    summary: computed(() => ledger.summary),
    rows: computed(() => ledger.rows),
    mechanics: computed(() => buildMechanicDictionary(ledger.rows)),
    percentExecutable: computed(() => executablePercent(ledger)),
    error: ledger.error,
  };
}
