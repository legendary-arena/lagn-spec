/**
 * Sweep Types — Server Layer (WP-209 / EC-241)
 *
 * Locked payload + summary contracts for the `legendary.sweep_runs` server
 * surface (POST `/api/sweep/runs` submission + GET `/api/sweep/latest` operator
 * query). Mirrors the WP-205 analytics-types module shape: closed union +
 * canonical-array + envelope-interface contracts, but with one crucial
 * difference — the closed anomaly-class union is NOT redefined here. It is
 * imported from `@legendary-arena/game-engine` so the server validator and the
 * WP-195 engine analyzer share a single source of truth. A drift between
 * server validation and engine classification is structurally impossible by
 * import (no parallel union to keep in sync).
 *
 * Layer-boundary contract: this module imports only from
 * `@legendary-arena/game-engine` (the `.` Runtime-Safe Engine Surface — sweep
 * analyzer exports are barrel-exposed there under WP-209). No `boardgame.io`,
 * no `pg`, no `apps/dashboard/**`. The dashboard's WP-210 `SweepHealthWidget`
 * consumes the `SweepRunSummary` shape via the HTTP response envelope, not via
 * a direct TypeScript import; cross-app type drift is enforced by a future
 * widget-side drift test in the same byte-identical pattern WP-203 established.
 *
 * Authority: WP-209 §Locked Type Contracts + §Non-Negotiable Constraints +
 * §Locked contract values; EC-241 §Locked Values + §Locked Type Contracts;
 * D-20701 (storage shape lock); D-20702 (auth posture); D-19502 (sweep anomaly
 * 4-class closed taxonomy carry-forward).
 */

import type {
  SweepAnomalyClass,
  ManifestClassification,
} from '@legendary-arena/game-engine';
import { SWEEP_ANOMALY_CLASSES } from '@legendary-arena/game-engine';

// why (D-19502 carry-forward): the closed 4-class anomaly taxonomy is the
// engine's single source of truth. The route validator re-exports the canonical
// array so unit tests can reach it via this module without crossing the engine
// import boundary in test files; production code imports either site
// interchangeably (both resolve to the same engine reference at runtime). A
// drift test in `sweep.routes.test.ts` asserts that any anomalyCounts object
// with keys outside this canonical set is rejected at the validator.
export type { SweepAnomalyClass, ManifestClassification };
export { SWEEP_ANOMALY_CLASSES };

/**
 * Request body shape for `POST /api/sweep/runs`.
 *
 * Locked per WP-209 §Locked Type Contracts. `runId` is the PRIMARY KEY of
 * `legendary.sweep_runs` (idempotent submission via `<shortSha>-<isoTimestampUtc>`
 * format from `scripts/sweep-submit.mjs`); `startedAt` is the client-supplied
 * sweep wall-clock; `cellCount` is the integer count of successfully classified
 * cells (bounded `[0, 10000]` defense-in-depth against malformed payloads);
 * `anomalyCounts` is the closed taxonomy histogram (keys ⊆ `SWEEP_ANOMALY_CLASSES`
 * enforced at validator); `manifestBlob` is the optional raw
 * `ManifestClassification` JSON for operator forensic re-analyze (omitted on
 * smaller payloads, present for nightly runs).
 *
 * The validator rejects in this order (first failure short-circuits — no DB I/O
 * until all pass): token-length-eq + timingSafeEqual; body parseable + ≤ 5 MB;
 * runId non-empty + ≤ 128 chars; startedAt ISO-8601-parseable; cellCount
 * integer in [0, 10000]; anomalyCounts keys ⊆ SWEEP_ANOMALY_CLASSES; runId
 * unique in legendary.sweep_runs.
 */
export interface SweepRunPayload {
  readonly runId: string;
  readonly startedAt: string;
  readonly cellCount: number;
  readonly anomalyCounts: Readonly<Record<SweepAnomalyClass, number>>;
  readonly manifestBlob?: unknown;
}

/**
 * Response row shape for `GET /api/sweep/latest`.
 *
 * Locked per WP-209 §Locked Type Contracts. DELIBERATELY EXCLUDES
 * `manifestBlob` — the blob is forensic-only and never shipped on the operator
 * dashboard read path. A future `GET /api/sweep/runs/:runId` may expose it,
 * deferred from v1 per WP-209 §Out of Scope. Field names are camelCase per the
 * WP-205 server-side convention; the underlying DB columns are snake_case
 * (`run_id`, `submitted_at`, `started_at`, `cell_count`, `anomaly_counts`) and
 * mapped explicitly in `sweep.logic.ts`'s row mapper.
 */
export interface SweepRunSummary {
  readonly runId: string;
  readonly submittedAt: string;
  readonly startedAt: string;
  readonly cellCount: number;
  readonly anomalyCounts: Readonly<Record<SweepAnomalyClass, number>>;
}

/**
 * Response envelope for `GET /api/sweep/latest`.
 *
 * Intentional deviation from the WP-205 `{ data: readonly T[] }` envelope —
 * `data` is an OBJECT (not a readonly array) because the endpoint serves two
 * semantically distinct payloads in one response: `latest` (the single
 * greatest-`submitted_at` row, or `null` when the table is empty) AND
 * `recentRuns` (the last ≤ 30 rows ordered `submitted_at DESC`). The
 * deviation is documented inline in the route handler with the WP-209
 * `// why:` comment per EC-241 §Required `// why:` Comments. When the table
 * is non-empty, `latest === recentRuns[0]` is invariant; the route handler
 * builds `latest` from the same SQL result that produces `recentRuns` so the
 * two cannot drift.
 */
export interface SweepLatestEnvelope {
  readonly data: {
    readonly latest: SweepRunSummary | null;
    readonly recentRuns: readonly SweepRunSummary[];
  };
}

/**
 * Response envelope on POST success (status 201).
 *
 * Locked per WP-209 §Non-Negotiable Constraints. The `accepted: true` literal
 * signals to the submission script (`scripts/sweep-submit.mjs`) that the POST
 * was accepted and the local artifact may be cleaned up; any other shape (or
 * non-201 status) triggers exit-code 4 with `sweep-output/<runId>/` preserved
 * for forensic per §Submission Script Failure Modes #7.
 */
export interface SweepRunPostSuccessEnvelope {
  readonly data: {
    readonly runId: string;
    readonly accepted: true;
  };
}

/**
 * Response envelope on POST failure (any non-201 status).
 *
 * Locked per WP-209 §Non-Negotiable Constraints. Mirrors WP-205 envelope shape
 * verbatim: `data` is an empty array (NOT an object) on failure; `error` is a
 * short closed-set string (`'unauthorized'`, `'invalid_request'`,
 * `'conflict'`, `'payload_too_large'`, `'internal_error'`). The closed-set
 * status-code domain per handler is locked: POST `{201, 400, 401, 409, 413,
 * 500}`; GET `{200, 401, 500}`. No 403 / 404 / 422 may leak from sweep handlers.
 */
export interface SweepRunPostFailureEnvelope {
  readonly data: readonly never[];
  readonly error: string;
}
