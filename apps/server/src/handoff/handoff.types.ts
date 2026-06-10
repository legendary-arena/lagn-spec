/**
 * Handoff Types — Server Layer (WP-232 / EC-264)
 *
 * Locked lifecycle + record + payload + envelope contracts for the
 * `legendary.finding_handoffs` server surface — the handoff plumbing between the
 * WP-231 Inspector and the downstream Builder / Architect roles. Each Inspector
 * finding becomes an addressable, claimable work-item with a server-enforced
 * lifecycle. These shapes are the byte-identical contract between
 * `scripts/handoffs-sync.mjs`, the route handlers, and the future dashboard
 * consumer — author them here once, consume verbatim everywhere else.
 *
 * Mirrors the WP-231 inspection-types module shape (closed union + canonical
 * readonly array + envelope interfaces). Two deliberate sourcing rules:
 *
 *   - `InspectionSeverity`, `InspectionRoute`, and `InspectionFinding` are
 *     IMPORTED from `../inspection/inspection.types.js` — the handoff module does
 *     NOT redefine the severity / route unions (one source of truth).
 *   - `anomalyClass` is a plain `string` (see the `// why:` below) — the engine's
 *     closed anomaly-class union is NOT imported on the handoff surface.
 *
 * Plumbing-only posture (D-23202): `branchRef` and `amendmentRequest` are
 * references the server STORES, never actions it performs. The server records the
 * strings; it creates no git branch, opens no PR, and edits no WP spec. The
 * unattended Builder (code-writer) and Architect (spec-writer) are the first such
 * surfaces in the pipeline and get their own separately-gated follow-up WP.
 *
 * Layer-boundary contract: this module imports ONLY the inspection types (no
 * `boardgame.io`, no `pg`, no `@legendary-arena/game-engine`, no
 * `apps/dashboard/**`).
 *
 * Authority: WP-232 §Locked Type Contracts + §Non-Negotiable Constraints +
 * §Locked contract values; EC-264 §Locked Values + §Guardrails + §Required
 * `// why:` Comments; D-23201 (storage shape + contract lock + snapshot posture);
 * D-23202 (lifecycle state machine + plumbing-only scope lock); D-23203
 * (idempotent sync + auth posture); D-23103 (anomalyClass opacity carry-forward).
 */

import type {
  InspectionFinding,
  InspectionRoute,
  InspectionSeverity,
} from '../inspection/inspection.types.js';

// why: `anomalyClass` is a plain string (NOT the engine's closed anomaly-class
// union) so the handoff surface carries no engine import — it snapshots whatever
// opaque string the inspection finding emitted (a `SWEEP_ANOMALY_CLASSES` member
// name, or `'meta'` for a run-level finding). D-23103 carries forward D-20703's
// opacity posture. The severity + route unions, by contrast, ARE imported from
// `inspection.types.ts` so there is one source of truth for those two closed
// sets — the handoff module never redefines them.
export type { InspectionFinding, InspectionRoute, InspectionSeverity };

/**
 * The handoff lifecycle status. Closed union per WP-232 §Locked Type Contracts /
 * D-23202. The server is the sole authority for this value; it changes only via a
 * transition the locked table permits.
 */
export type HandoffStatus =
  | 'open' // materialized from a finding; not yet picked up
  | 'claimed' // a Builder session has taken ownership
  | 'fix-proposed' // a fix branch / PR reference was recorded (server stores the ref; it does not create the branch)
  | 'escalated' // a spec gap was escalated to the Architect (amendmentRequest recorded)
  | 'resolved' // closed as handled (terminal)
  | 'wont-fix'; // closed as not-a-bug / deferred (terminal)

// why: canonical readonly array paired with the closed `HandoffStatus` union per
// `00.6 §Drift Detection`. The drift test in `handoff.logic.test.ts` asserts
// forward + backward inclusion against the union; the route validator builds its
// membership Set from this array so a union change forces both the array and the
// validator gate to update in lockstep.
/**
 * Canonical readonly array mirroring `HandoffStatus`, in lifecycle order.
 */
export const HANDOFF_STATUSES: readonly HandoffStatus[] = [
  'open',
  'claimed',
  'fix-proposed',
  'escalated',
  'resolved',
  'wont-fix',
] as const;

/**
 * A single handoff row + the wire shape returned by `GET /api/handoffs/latest`.
 * Locked per WP-232 §Locked Type Contracts.
 *
 * `handoffId` is the deterministic PRIMARY KEY of form `<reportId>#<findingIndex>`.
 * The `severity` / `route` / `anomalyClass` / `cellId` / `description` fields are
 * a point-in-time SNAPSHOT of the finding for cheap addressable reads — the
 * `inspection_reports` row remains authoritative for finding content. The handoff
 * row is authoritative ONLY for lifecycle `status` + the `branchRef` /
 * `amendmentRequest` references. The snapshotted `description` is LLM-generated
 * and intentionally nondeterministic (D-23102, inherited) — never asserted by
 * content. `branchRef` is `null` until `'fix-proposed'`; `amendmentRequest` is
 * `null` until `'escalated'` — both `string | null` (never `undefined`), so
 * `mapRowToHandoff` returns `null` for an absent reference.
 */
export interface HandoffRecord {
  readonly handoffId: string;
  readonly reportId: string;
  readonly sweepRunId: string;
  readonly findingIndex: number;
  readonly severity: InspectionSeverity;
  readonly route: InspectionRoute;
  readonly anomalyClass: string;
  readonly cellId: string | null;
  readonly description: string;
  readonly status: HandoffStatus;
  readonly branchRef: string | null;
  readonly amendmentRequest: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Request body shape for `POST /api/handoffs/transition`. Locked per WP-232
 * §Locked Type Contracts.
 *
 * `branchRef` and `amendmentRequest` are wire-OPTIONAL (`exactOptionalPropertyTypes`):
 * the validator reads them defensively (presence + non-empty) and the route layer
 * REQUIRES `branchRef` (non-empty, <= 200 chars) when `toStatus === 'fix-proposed'`
 * and `amendmentRequest` (non-empty, <= 2000 chars) when `toStatus === 'escalated'`
 * (both 400 if missing). Tests OMIT the key for the "absent" case rather than
 * setting it to `undefined`. When present they are `string | null`.
 */
export interface HandoffTransitionPayload {
  readonly handoffId: string;
  readonly toStatus: HandoffStatus;
  readonly branchRef?: string | null;
  readonly amendmentRequest?: string | null;
}

/**
 * Response body shape for `POST /api/handoffs/sync` (`{ data: HandoffSyncSummary }`).
 * Locked per WP-232 §Locked Type Contracts.
 *
 * `created + unchanged === findingCount` always holds. An empty
 * `inspection_reports` yields `reportId: null` + all-zero counts.
 */
export interface HandoffSyncSummary {
  readonly reportId: string | null;
  readonly findingCount: number;
  readonly created: number;
  readonly unchanged: number;
}

/**
 * Per-status counts over the returned handoffs, computed by
 * `countHandoffsByStatus`. Sums to `handoffs.length`. The camelCase
 * `fixProposed` / `wontFix` keys map to the `'fix-proposed'` / `'wont-fix'`
 * lifecycle statuses.
 */
export interface HandoffStatusCounts {
  readonly open: number;
  readonly claimed: number;
  readonly fixProposed: number;
  readonly escalated: number;
  readonly resolved: number;
  readonly wontFix: number;
}

/**
 * Response envelope for `GET /api/handoffs/latest`. Locked per WP-232 §Locked
 * Type Contracts.
 *
 * `data` is an OBJECT (not the WP-205 `data: readonly T[]` shape) because the
 * endpoint serves the latest report's handoffs plus the per-status counts in one
 * response — the same deviation WP-209's `GET /api/sweep/latest` justified.
 * `reportId` is the latest report present in `finding_handoffs`, or `null` when
 * empty. `handoffs` is that report's rows ordered by `(finding_index ASC,
 * handoff_id ASC)`, always <= 500. `counts` sums to `handoffs.length`.
 */
export interface HandoffLatestEnvelope {
  readonly data: {
    readonly reportId: string | null;
    readonly handoffs: readonly HandoffRecord[];
    readonly counts: HandoffStatusCounts;
  };
}
