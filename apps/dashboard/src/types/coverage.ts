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

/**
 * The runtime-observed hollow-effect overlay (WP-259 / D-24035). Build-time
 * copy of `docs/ai/coverage/runtime-observed-hollows.json`, produced by the
 * `runtime-observed-hollows` harness (a fixed-seed deterministic sim sweep) and
 * copied into `src/data` by `scripts/build-coverage-ledger.mjs`. The static
 * ledger above answers "unsupported in theory?"; this answers "did it actually
 * bite a player in play?". The three `byReason` keys are the closed WP-257
 * hollow set (always present, even at 0).
 */
export interface RuntimeObservedByReason {
  'no-handler': number;
  'unsupported-keyword': number;
  'parse-unrecognized': number;
}

/** One example card that hit a mechanic's hollow handler during the sweep. */
export interface RuntimeObservedExample {
  cardId: string;
  cardType: string;
  timing: string;
  reason: string;
}

/** Per-mechanic runtime-observed tally — the value the overlay joins per row. */
export interface RuntimeObservedEntry {
  hitCount: number;
  lastSeenTurn: number;
  byReason: RuntimeObservedByReason;
  examples: readonly RuntimeObservedExample[];
}

export interface RuntimeObservedGeneratedFrom {
  runSeed: string | number;
  gamesPlayed: number;
  matrixDescription: string;
}

export interface RuntimeObservedSummary {
  distinctMechanics: number;
  totalObservations: number;
  hollowEffectsDropped: number;
  byReason: RuntimeObservedByReason;
}

export interface RuntimeObservedHollows {
  schemaVersion: number;
  generatedFrom: RuntimeObservedGeneratedFrom;
  summary: RuntimeObservedSummary;
  byMechanic: Record<string, RuntimeObservedEntry>;
  /** Present only when the build-time copy failed (empty-stub path). */
  error?: string;
}
