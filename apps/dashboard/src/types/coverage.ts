/**
 * Types for the Coverage page — the hero mechanic ledger surfaced on the
 * dashboard. The runtime data is `src/data/coverage-ledger.json`, a build-time
 * copy of `docs/ai/coverage/hero-mechanic-ledger.json` (see
 * `scripts/build-coverage-ledger.mjs`). The canonical four-state status mirrors
 * the generator in `scripts/hero-mechanic-ledger.mjs`.
 */

/** The four kinds of coverage state (drift-pinned by `types/coverage.drift.test.ts`). */
export type LedgerStatus = 'executable' | 'deferred' | 'unsupported' | 'unmarked';

export const LEDGER_STATUSES: readonly LedgerStatus[] = [
  'executable',
  'deferred',
  'unsupported',
  'unmarked',
];

/** One ledger row: a (hero card × mechanic) pair with its status + provenance. */
export interface LedgerRow {
  extId: string;
  heroName: string;
  set: string;
  mechanic: string;
  status: LedgerStatus;
  /** Work Packet that implemented the mechanic (blank if not yet attributed). */
  wp: string;
  /** DECISIONS.md id (blank if not yet attributed). */
  decision: string;
  /** module#key for executable mechanics — the bug→code jump (blank otherwise). */
  handler: string;
}

export interface LedgerByStatus {
  executable: number;
  deferred: number;
  unsupported: number;
  unmarked: number;
}

export interface LedgerSummary {
  totalRows: number;
  byStatus: LedgerByStatus;
  distinctMechanics: number;
}

export interface CoverageLedger {
  schemaVersion: number;
  cardType: string;
  summary: LedgerSummary;
  rows: readonly LedgerRow[];
  /** Present only when the build-time copy failed (empty-stub path). */
  error?: string;
}

/**
 * A by-mechanic dictionary entry — the implementation worklist view. One per
 * distinct mechanic, since implementing one mechanic clears every card using it.
 */
export interface MechanicEntry {
  mechanic: string;
  status: LedgerStatus;
  cardCount: number;
  wp: string;
  decision: string;
  handler: string;
}
